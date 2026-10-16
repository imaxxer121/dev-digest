import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';
import { AgentsService } from '../src/modules/agents/service.js';
import { SkillsService } from '../src/modules/skills/service.js';
import { LocalProjectContextFiles } from '../src/adapters/project-context/files.js';

// Required real PostgreSQL evidence: failure to start Docker fails, never silently skips.
describe('repository-qualified attached document persistence and ownership', () => {
  let pg: PgFixture, root: string, workspaceId: string, foreignId: string, repoId: string, repoB: string, foreignRepo: string;
  let container: Container, agents: AgentsService, skills: SkillsService;
  const files = new LocalProjectContextFiles(), read = vi.spyOn(files, 'read'), discover = vi.spyOn(files, 'discover');
  const llm = vi.fn(async () => { throw new Error('Context must not resolve providers'); });
  beforeAll(async () => {
    pg = await startPg();
    // T4 alone generates the combined migration. Allow this isolated fixture to
    // self-verify T2 before integration; IF NOT EXISTS is a no-op after T4 lands.
    await pg.handle.sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS attached_docs jsonb NOT NULL DEFAULT '[]'::jsonb`;
    await pg.handle.sql`ALTER TABLE skills ADD COLUMN IF NOT EXISTS attached_docs jsonb NOT NULL DEFAULT '[]'::jsonb`;
    const seeded = await seed(pg.handle.db); workspaceId = seeded.workspaceId;
    root = await mkdtemp(join(tmpdir(), 'attached-docs-')); await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'docs', 'a.md'), 'FILESYSTEM A'); await writeFile(join(root, 'docs', 'b.md'), 'FILESYSTEM B');
    const [foreign] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign-context' }).returning(); foreignId = foreign!.id;
    const db = pg.handle.db;
    const makeRepo = async (workspace: string, name: string) => (await db.insert(t.repos).values({ workspaceId: workspace, owner: 'fixture', name, fullName: `fixture/${name}`, clonePath: root }).returning())[0]!.id;
    repoId = await makeRepo(workspaceId, 'a'); repoB = await makeRepo(workspaceId, 'b'); foreignRepo = await makeRepo(foreignId, 'foreign');
    container = new Container(loadConfig({ NODE_ENV: 'test' }), db, { projectContextFiles: files });
    container.llm = llm; agents = new AgentsService(container); skills = new SkillsService(container);
  }, 120_000);
  afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); await pg?.stop(); });
  const bind = (path: string, repo_id = repoId) => ({ repo_id, path });
  const newAgent = (ws = workspaceId) => agents.create(ws, { name: 'Context reviewer', provider: 'openai', model: 'fixture', system_prompt: 'Review' });
  const newSkill = (ws = workspaceId) => skills.create(ws, { name: 'Context Skill', body: 'unchanged body' });

  it('persists only ordered identities on Agent/Skill rows; preserves body/config versions and reload order', async () => {
    const agent = await newAgent(), skill = await newSkill();
    const ordered = [bind('docs/b.md'), bind('docs/a.md', repoB), bind('docs/a.md')];
    await agents.update(workspaceId, agent.id, { attached_docs: ordered }); await skills.update(workspaceId, skill.id, { attached_docs: ordered });
    expect((await agents.get(workspaceId, agent.id))?.attached_docs).toEqual(ordered);
    expect((await skills.get(workspaceId, skill.id))?.attached_docs).toEqual(ordered);
    expect((await agents.listVersions(workspaceId, agent.id))).toHaveLength(1); expect((await skills.listVersions(workspaceId, skill.id))).toHaveLength(1);
    const [row] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));
    expect(row).toMatchObject({ body: 'unchanged body', version: 1, attachedDocs: ordered });
    expect(JSON.stringify(row!.attachedDocs)).not.toContain('FILESYSTEM');
    await agents.update(workspaceId, agent.id, { attached_docs: [ordered[2]!, ordered[0]!] });
    expect((await agents.get(workspaceId, agent.id))?.attached_docs).toEqual([ordered[2], ordered[0]]);
    expect(llm).not.toHaveBeenCalled();
  });
  it('rejects foreign agent/Skill/repo bindings before any filesystem activity or mutation', async () => {
    const agent = await newAgent(), foreignAgent = await newAgent(foreignId), skill = await newSkill(), foreignSkill = await newSkill(foreignId);
    read.mockClear(); discover.mockClear();
    expect(await agents.update(workspaceId, foreignAgent.id, { attached_docs: [bind('docs/a.md')] })).toBeUndefined();
    expect(await skills.update(workspaceId, foreignSkill.id, { attached_docs: [bind('docs/a.md')] })).toBeUndefined();
    await expect(agents.update(workspaceId, agent.id, { attached_docs: [bind('docs/a.md'), bind('docs/a.md', foreignRepo)] })).rejects.toMatchObject({ statusCode: 404 });
    await expect(skills.update(workspaceId, skill.id, { attached_docs: [bind('docs/a.md', foreignRepo)] })).rejects.toMatchObject({ statusCode: 404 });
    await expect(container.projectContext.list(workspaceId, foreignRepo)).rejects.toMatchObject({ statusCode: 404 });
    await expect(container.projectContext.preview(workspaceId, foreignRepo, 'docs/a.md')).rejects.toMatchObject({ statusCode: 404 });
    expect(read).not.toHaveBeenCalled(); expect(discover).not.toHaveBeenCalled();
    expect((await agents.get(workspaceId, agent.id))?.attached_docs).toEqual([]);
    expect((await skills.get(workspaceId, skill.id))?.attached_docs).toEqual([]);
  });
  it('uses real loaded/enabled links in saved order, skips foreign repository identities and refreshes changed file content', async () => {
    const agent = await newAgent(), one = await newSkill(), two = await newSkill(), disabled = await newSkill();
    await agents.update(workspaceId, agent.id, { attached_docs: [bind('docs/a.md', repoB)] });
    await skills.update(workspaceId, one.id, { attached_docs: [bind('docs/a.md')] });
    await skills.update(workspaceId, two.id, { attached_docs: [bind('docs/b.md'), bind('docs/a.md')] });
    await skills.update(workspaceId, disabled.id, { attached_docs: [bind('docs/a.md')], enabled: false });
    await container.agentsRepo.setSkills(agent.id, [two.id, disabled.id, one.id]);
    const agentRow = (await container.agentsRepo.getById(workspaceId, agent.id))!;
    const loaded = await Promise.all([one.id, two.id, disabled.id].map(async id => (await container.skillsRepo.getById(workspaceId, id))!));
    await container.projectContext.preview(workspaceId, repoId, 'docs/a.md'); await writeFile(join(root, 'docs', 'a.md'), 'FRESH A');
    read.mockClear();
    const result = await container.projectContext.resolveForAgent(workspaceId, repoId, agentRow, loaded);
    expect(result.trace.reads.map(doc => doc.path)).toEqual(['docs/b.md', 'docs/a.md']); expect(read).toHaveBeenCalledTimes(2);
    expect(result.specs[1]).toContain('FRESH A'); expect(result.specs[1]).not.toContain('FILESYSTEM A');
    const noLoaded = await container.projectContext.resolveForAgent(workspaceId, repoId, agentRow, []); expect(noLoaded.specs).toEqual([]);
    expect(llm).not.toHaveBeenCalled();
  });
  it('logical text names colliding with filesystem paths stay separate', async () => {
    await container.contextRepo.save(workspaceId, repoId, { path: 'docs/a.md', content: 'LOGICAL BODY ONLY' });
    expect((await container.contextRepo.list(workspaceId, repoId))[0]?.content).toBe('LOGICAL BODY ONLY');
    expect((await container.projectContext.preview(workspaceId, repoId, 'docs/a.md')).content).toBe('FRESH A');
    expect(llm).not.toHaveBeenCalled();
  });
});
