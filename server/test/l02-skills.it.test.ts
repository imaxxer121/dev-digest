import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { ConventionsRepository } from '../src/modules/conventions/repository.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import type { FastifyInstance } from 'fastify';
const enabled = await dockerAvailable();
(enabled ? describe : describe.skip)('L02 persisted knowledge (PostgreSQL)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;
  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
    app = await buildApp({config: loadConfig({...process.env,NODE_ENV:'test'}), db:pg.handle.db, overrides:{secrets:{get:async()=>undefined}}});
  }, 120_000);
  afterAll(async () => { await app?.close(); await pg?.stop(); });
  const request = async (method: 'GET'|'POST'|'PUT'|'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({method,url,...(payload !== undefined ? {payload:payload as any} : {})});
    expect(res.statusCode).toBeLessThan(400);
    return res.json();
  };
  it('creates, versions, restores and deletes actual rows, including direct DB deletion', async () => {
    const skill = await request('POST','/skills',{name:'CRUD probe',body:'# First body'});
    expect((await pg.handle.db.select().from(t.skills).where(eq(t.skills.id,skill.id)))[0]?.body).toBe('# First body');
    await request('PUT',`/skills/${skill.id}`,{body:'# Second body',version_message:'Update'});
    const versions = await request('GET',`/skills/${skill.id}/versions`);
    expect(versions.map((v:any) => v.version)).toEqual([2,1]);
    expect((await request('POST',`/skills/${skill.id}/restore`,{version:1})).body).toBe('# First body');
    await request('DELETE',`/skills/${skill.id}`);
    expect((await app.inject({method:'GET',url:`/skills/${skill.id}`})).statusCode).toBe(404);
    const external = await request('POST','/skills',{name:'DB deletion probe',body:'# Body'});
    await pg.handle.db.delete(t.skills).where(eq(t.skills.id,external.id));
    expect((await request('GET','/skills')).some((s:any) => s.id === external.id)).toBe(false);
  });
  it('serializes concurrent body edits with a matching immutable snapshot', async () => {
    const skill = await request('POST','/skills',{name:'Concurrent edits',body:'# Initial'});
    await Promise.all([
      request('PUT',`/skills/${skill.id}`,{body:'# Edit A'}),
      request('PUT',`/skills/${skill.id}`,{body:'# Edit B'}),
    ]);
    const current = await request('GET',`/skills/${skill.id}`);
    const versions = await request('GET',`/skills/${skill.id}/versions`);
    expect(current.version).toBe(3);
    expect(versions.map((v:any) => v.version)).toEqual([3,2,1]);
    expect(versions[0].body).toBe(current.body);
    expect(new Set(versions.map((v:any) => v.body))).toEqual(new Set(['# Initial','# Edit A','# Edit B']));
  });
  it('previews markdown and zip without creating rows', async () => {
    const before = (await request('GET','/skills')).length;
    const md = await request('POST','/skills/import',{filename:'rubric.md',content_base64:Buffer.from('# Imported\n\nReview APIs.').toString('base64')});
    expect(md.name).toBe('Imported');
    const zip = zipSync({'SKILL.md':strToU8('# Zip Skill\n\nCore rules.'),'references/extra.md':strToU8('Ignored context')});
    const preview = await request('POST','/skills/import',{filename:'skill.zip',content_base64:Buffer.from(zip).toString('base64')});
    expect(preview.body).toContain('Core rules');
    expect(preview.ignored_files).toEqual(['references/extra.md']);
    expect((await request('GET','/skills')).length).toBe(before);
  });
  it('reads nested SKILL.md and rejects oversized or invalid zip contents before persisting', async () => {
    const nested = zipSync({'package/SKILL.md':strToU8('# Nested Skill\n\nReview rules.'),'package/image.bin':new Uint8Array([1,2])});
    const preview = await request('POST','/skills/import',{filename:'nested.zip',content_base64:Buffer.from(nested).toString('base64')});
    expect(preview.name).toBe('Nested Skill');
    expect(preview.ignored_files).toEqual(['package/image.bin']);
    const oversized = zipSync({'SKILL.md':strToU8('# Small'), 'large.bin':new Uint8Array(5 * 1024 * 1024 + 1)});
    const rejected = await app.inject({method:'POST',url:'/skills/import',payload:{filename:'oversized.zip',content_base64:Buffer.from(oversized).toString('base64')}});
    expect(rejected.statusCode).toBe(422);
    const invalid = await app.inject({method:'POST',url:'/skills/import',payload:{filename:'broken.zip',content_base64:Buffer.from('not a zip').toString('base64')}});
    expect(invalid.statusCode).toBe(422);
  });
  it('saves ordered links and rejects foreign or duplicate IDs without destroying links', async () => {
    const first = await request('POST','/skills',{name:'First',body:'# First'});
    const second = await request('POST','/skills',{name:'Second',body:'# Second'});
    const agent = await request('POST','/agents',{name:'Linked reviewer',provider:'codex',model:'catalog-model',system_prompt:'Review code'});
    await request('POST',`/agents/${agent.id}/skills`,{skill_ids:[second.id,first.id]});
    expect((await request('GET',`/agents/${agent.id}/skills`)).map((l:any) => l.skill_id)).toEqual([second.id,first.id]);
    const [foreignWs] = await pg.handle.db.insert(t.workspaces).values({name:'Foreign'}).returning();
    const [foreign] = await pg.handle.db.insert(t.skills).values({workspaceId:foreignWs!.id,name:'Foreign',description:'',body:'Do not disclose',type:'custom',source:'manual'}).returning();
    expect((await app.inject({method:'POST',url:`/agents/${agent.id}/skills`,payload:{skill_ids:[foreign!.id]}})).statusCode).toBe(422);
    expect((await app.inject({method:'POST',url:`/agents/${agent.id}/skills`,payload:{skill_ids:[first.id,first.id]}})).statusCode).toBe(422);
    expect((await request('GET',`/agents/${agent.id}/skills`)).map((l:any) => l.skill_id)).toEqual([second.id,first.id]);
    await request('DELETE',`/agents/${agent.id}`);
    expect((await pg.handle.db.select().from(t.agents).where(eq(t.agents.id,agent.id))).length).toBe(0);
  });
  it('persists Accept/Reject/Edit across reads and composes only accepted conventions', async () => {
    const repo = (await pg.handle.db.select().from(t.repos))[0]!;
    const conventions = new ConventionsRepository(pg.handle.db);
    const rows = await conventions.replaceForRepo(workspaceId,repo.id,[
      {workspaceId,repoId:repo.id,category:'errors',rule:'Use typed errors',evidencePath:'src/errors.ts',evidenceLine:3,evidenceSnippet:'class NotFoundError extends Error {}',confidence:0.9},
      {workspaceId,repoId:repo.id,category:'style',rule:'Rejected rule',evidencePath:'src/style.ts',evidenceLine:1,evidenceSnippet:'export const x = 1',confidence:0.6},
    ]);
    await request('PUT',`/conventions/${rows[0]!.id}`,{status:'accepted',rule:'Use typed boundary errors'});
    await request('PUT',`/conventions/${rows[1]!.id}`,{status:'rejected'});
    const listed = await request('GET',`/repos/${repo.id}/conventions`);
    expect(listed.map((c:any) => c.status).sort()).toEqual(['accepted','rejected']);
    const skill = await request('POST',`/repos/${repo.id}/conventions/skill`,{name:'repo-conventions',description:'Accepted rules'});
    expect(skill.body).toContain('Use typed boundary errors');
    expect(skill.body).toContain('src/errors.ts:3');
    expect(skill.body).not.toContain('Rejected rule');
    const edited = await request('POST',`/repos/${repo.id}/conventions/skill`,{name:'Edited draft',description:'User-reviewed text',body:'# Accepted rules\n\nUse typed boundary errors; preserve the public error code.'});
    expect((await request('GET',`/skills/${edited.id}`)).body).toBe('# Accepted rules\n\nUse typed boundary errors; preserve the public error code.');
    await conventions.replaceForRepo(workspaceId,repo.id,[]);
    expect((await request('GET',`/repos/${repo.id}/conventions`)).length).toBe(2);
  });
});
