#!/usr/bin/env node
// Static policy validation only. No package install, network, agent or file writes.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = [
  'researcher', 'planner', 'implementer', 'test-writer',
  'architecture-reviewer', 'security-reviewer', 'plan-verifier', 'doc-writer',
  'brainstorm', 'spec-creator', 'implementation-planner',
];
const readOnly = new Set([
  'researcher', 'planner', 'architecture-reviewer', 'security-reviewer',
  'plan-verifier', 'brainstorm',
]);
const safeReadTools = new Set(['Read', 'Glob', 'Grep']);
const knownTools = new Set([...safeReadTools, 'Write', 'Edit', 'Bash']);
const errors = [];
const text = (relative) => readFileSync(path.join(root, relative), 'utf8').replace(/^\uFEFF/, '');
const check = (condition, message) => { if (!condition) errors.push(message); };

// Profiles intentionally use this small, valid YAML subset: scalar strings and
// block string lists. Reject unsupported syntax rather than misparse it as policy.
function frontmatter(source, file) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${file}: missing delimited frontmatter`);
  const values = {};
  let listKey;
  const scalar = (value) => {
    if (value.startsWith('"')) {
      const parsed = JSON.parse(value);
      if (typeof parsed !== 'string') throw new Error('expected a string');
      return parsed;
    }
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) {
      throw new Error(`unsupported YAML scalar: ${value}`);
    }
    return value;
  };
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const item = line.match(/^  - (.+)$/);
    if (item) {
      if (!listKey) throw new Error(`${file}: list item without a list key`);
      values[listKey].push(scalar(item[1]));
      continue;
    }
    const field = line.match(/^([a-z][a-z-]*):(?: (.+))?$/);
    if (!field) throw new Error(`${file}: unsupported YAML line: ${line}`);
    if (Object.hasOwn(values, field[1])) throw new Error(`${file}: duplicate ${field[1]}`);
    listKey = field[2] === undefined ? field[1] : undefined;
    values[field[1]] = listKey ? [] : scalar(field[2]);
  }
  return { values, body: source.slice(match[0].length) };
}

function skillReferences(source, file) {
  for (const match of source.matchAll(/\.claude\/skills\/([a-z0-9-]+)\/SKILL\.md/g)) {
    check(existsSync(path.join(root, '.claude/skills', match[1], 'SKILL.md')),
      `${file}: missing body skill reference ${match[1]}`);
  }
}

function localLinks(source, file) {
  for (const match of source.matchAll(/\]\(([^\s)]+)\)/g)) {
    const link = match[1].split('#')[0];
    if (!link || /^[a-z]+:|^\//i.test(link)) continue;
    const target = path.resolve(path.dirname(path.join(root, file)), link);
    check(existsSync(target), `${file}: missing local link ${link}`);
  }
}

function validateProfiles() {
  const directory = path.join(root, '.claude/agents');
  const files = readdirSync(directory).filter((file) => file.endsWith('.md') && file !== 'README.md');
  check(files.length === names.length, `expected ${names.length} profiles, found ${files.length}`);
  const seen = new Set();
  for (const name of names) check(files.includes(`${name}.md`), `missing agent ${name}`);
  for (const file of files) {
    const relative = `.claude/agents/${file}`;
    const source = text(relative);
    let parsed;
    try { parsed = frontmatter(source, relative); }
    catch (error) { errors.push(error.message); continue; }
    const { values: metadata, body } = parsed;
    const name = metadata.name;
    check(typeof name === 'string' && names.includes(name), `${relative}: unexpected name ${name}`);
    check(name === file.slice(0, -3), `${relative}: name must match filename`);
    check(!seen.has(name), `${relative}: duplicate name ${name}`);
    seen.add(name);
    check(Object.keys(metadata).sort().join(',') === 'description,model,name,skills,tools',
      `${relative}: expected only name/description/model/tools/skills metadata`);
    check(typeof metadata.description === 'string' && metadata.description.length >= 30,
      `${relative}: missing routing description`);
    check(metadata.model === 'inherit', `${relative}: model must inherit the active session`);
    check(Array.isArray(metadata.tools) && metadata.tools.length > 0, `${relative}: missing tools list`);
    const tools = Array.isArray(metadata.tools) ? metadata.tools : [];
    check(new Set(tools).size === tools.length, `${relative}: duplicate tool`);
    for (const tool of tools) check(knownTools.has(tool), `${relative}: disallowed/unknown tool ${tool}`);
    if (readOnly.has(name)) {
      check(tools.length === safeReadTools.size && tools.every((tool) => safeReadTools.has(tool)),
        `${relative}: read-only role must have Read/Glob/Grep only; no shell/write/delegation escape`);
      check(/Read-only: no file writes/.test(body), `${relative}: missing explicit read-only body boundary`);
    } else {
      check(tools.includes('Write') && tools.includes('Edit'), `${relative}: writer missing explicit edit tools`);
      check(/Write only the (?:dispatched|single designated)/.test(body),
        `${relative}: missing scoped write ownership`);
    }
    check(/No delegation or nested agents\.|delegation or\s+nested agents|delegation or nested agents/i.test(body),
      `${relative}: missing no-delegation body boundary`);
    if (!['implementer', 'test-writer'].includes(name)) {
      check(!tools.includes('Bash'), `${relative}: this role must have no shell tool`);
    }
    check(Array.isArray(metadata.skills) && metadata.skills.length > 0, `${relative}: missing skills list`);
    const skills = Array.isArray(metadata.skills) ? metadata.skills : [];
    check(new Set(skills).size === skills.length, `${relative}: duplicate skill`);
    for (const skill of skills) {
      check(/^[a-z0-9-]+$/.test(skill) && existsSync(path.join(root, '.claude/skills', skill, 'SKILL.md')),
        `${relative}: missing/invalid skill ${skill}`);
    }
    skillReferences(source, relative);
  }
  const spec = text('.claude/agents/spec-creator.md');
  for (const category of ['Goals and scope', 'Behavior and UX', 'Data and contracts',
    'Edge cases and failures', 'Non-functional constraints', 'Acceptance and verification']) {
    check(spec.includes(category), `spec-creator: missing clarification category ${category}`);
  }
  for (const keyword of ['EARS', 'AC ID', 'WHEN', 'WHILE', 'IF', 'THEN', 'WHERE', 'SHALL']) {
    check(spec.includes(keyword), `spec-creator: missing acceptance convention ${keyword}`);
  }
  const planner = text('.claude/agents/implementation-planner.md');
  for (const phrase of ['single designated plan artifact', 'Preserve AC IDs', 'non-overlapping owned paths',
    'never author, edit or silently expand the specification']) {
    check(planner.includes(phrase), `implementation-planner: missing ${phrase}`);
  }
}

function validateWorkflow() {
  const run = text('.claude/skills/run-plan/SKILL.md');
  const review = text('.claude/skills/pr-self-review/SKILL.md');
  const registry = text('docs/development-agent-registry.md');
  for (const [file, expectedName] of [
    ['.claude/skills/run-plan/SKILL.md', 'run-plan'],
    ['.claude/skills/pr-self-review/SKILL.md', 'pr-self-review'],
  ]) {
    const { values } = frontmatter(text(file), file);
    check(values.name === expectedName && typeof values.description === 'string', `${file}: invalid skill metadata`);
  }
  for (const name of names) {
    check(registry.includes(`](../.claude/agents/${name}.md)`), `registry: missing linked agent ${name}`);
  }
  for (const phrase of ['model: inherit', 'separate L05 SDD artifact author', 'not an independently installed Codex',
    'unknown/null', 'denominator']) check(registry.includes(phrase), `registry: missing ${phrase}`);
  for (const phrase of ['existing agreed specification and implementation plan', 'authorization',
    'mode:multi', 'mode:single', 'max-fix', 'default maximum three', 'Maximum three',
    'No test-writer: do not spawn test-writer', 'non-overlapping owned paths', 'prerequisites successfully complete',
    'architecture-reviewer and plan-verifier concurrently', 'No commits, pushes, merges, PR creation',
    'Stop early on no progress', 'Never mark them passed', 'unknown/null']) {
    check(run.replace(/\r?\n/g, ' ').includes(phrase), `run-plan: missing workflow boundary ${phrase}`);
  }
  for (const skill of ['frontend-architecture', 'react-best-practices', 'react-testing-library',
    'onion-architecture', 'fastify-best-practices', 'drizzle-orm-patterns']) {
    check(review.includes(`.claude/skills/${skill}/SKILL.md`), `pr-self-review: missing stack routing ${skill}`);
  }
  check(review.includes('second uncommitted diff pass'), 'pr-self-review: missing final post-fix pass');
  check(review.includes('Do not install or enable Git hooks'), 'pr-self-review: missing no-hooks rule');
  check(existsSync(path.join(root, '.claude/skills/workflow-retro/SKILL.md')), 'workflow-retro must remain available');
  for (const file of ['.claude/agents/README.md', '.claude/skills/README.md',
    '.claude/skills/run-plan/README.md', '.claude/skills/run-plan/SKILL.md',
    '.claude/skills/pr-self-review/SKILL.md', 'docs/development-agent-registry.md',
    'docs/agent-prompts/README.md']) {
    const source = text(file);
    localLinks(source, file);
    skillReferences(source, file);
  }
}

function expandBraces(pattern) {
  const match = pattern.match(/\{([^{}]+)\}/);
  if (!match) return [pattern];
  return match[1].split(',').flatMap((item) =>
    expandBraces(pattern.slice(0, match.index) + item + pattern.slice(match.index + match[0].length)));
}

function segmentsMayOverlap(first, second) {
  const seen = new Set();
  function visit(i, j) {
    const key = `${i}:${j}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (i === first.length && j === second.length) return true;
    if (first[i] === '*' && visit(i + 1, j)) return true;
    if (second[j] === '*' && visit(i, j + 1)) return true;
    if (i === first.length || j === second.length) return false;
    if (first[i] !== '*' && second[j] !== '*' && first[i] !== second[j]) return false;
    return visit(first[i] === '*' ? i : i + 1, second[j] === '*' ? j : j + 1);
  }
  return visit(0, 0);
}

// Segment intersection treats * as any string and ** as descendant ownership.
// Square brackets in Next.js directory names remain literal.
function pathsMayOverlap(first, second) {
  const a = first.split('/');
  const b = second.split('/');
  const seen = new Set();
  function visit(i, j) {
    const key = `${i}:${j}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (i === a.length && j === b.length) return true;
    if (a[i] === '**') return i === a.length - 1 || visit(i + 1, j) || (j < b.length && visit(i, j + 1));
    if (b[j] === '**') return j === b.length - 1 || visit(i, j + 1) || (i < a.length && visit(i + 1, j));
    if (i === a.length || j === b.length) return false;
    return segmentsMayOverlap(a[i], b[j]) && visit(i + 1, j + 1);
  }
  return visit(0, 0);
}

function dryRunPlan(relative) {
  const resolved = path.resolve(root, relative);
  const inside = path.relative(root, resolved);
  if (inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) throw new Error('plan must be inside the repository');
  if (!statSync(resolved).isFile()) throw new Error('plan must be a regular file');
  const plan = readFileSync(resolved, 'utf8').replace(/\r\n/g, '\n');
  const tasks = [...plan.matchAll(/^### (T\d+)[^\n]*\n([\s\S]*?)(?=^### T\d+|(?![\s\S]))/gm)].map((match) => {
    const block = match[2];
    const depLine = block.match(/\*\*Depends-on:\*\*([^\n]*)/)?.[1];
    if (!depLine) throw new Error(`${match[1]}: no Depends-on field`);
    const expandedDeps = depLine.replace(/T(\d+)[–-]T(\d+)/g, (_, start, end) =>
      Array.from({ length: Number(end) - Number(start) + 1 }, (__, index) => `T${Number(start) + index}`).join(', '));
    const dependencies = [...new Set(expandedDeps.match(/\bT\d+\b/g) ?? [])];
    const owned = block.split('**Owned paths:**')[1]?.split(/\n- \*\*(?:Action|Checks|Runtime handoff):/)[0]?.split('\n\n')[0];
    if (!owned) throw new Error(`${match[1]}: no Owned paths field`);
    const tokens = [...owned.matchAll(/`([^`]+)`/g)].map((item) => item[1]);
    const prBase = 'client/src/app/repos/[repoId]/pulls/[number]/';
    let testBase;
    const patterns = tokens.flatMap((token) => {
      if (token === prBase) return []; // prose "under <base>" qualifier, not ownership of the whole PR tree
      if (token.startsWith('_components/')) token = prBase + token;
      if (token.startsWith('server/test/')) testBase = 'server/test/';
      else if (!token.includes('/') && testBase && token.includes('.test.ts')) token = testBase + token;
      const candidates = token.startsWith('*/')
        ? [`client${token.slice(1)}`, `server${token.slice(1)}`] // this plan's "both copies"
        : [token];
      return candidates.flatMap((candidate) => expandBraces(candidate.endsWith('/') ? `${candidate}**` : candidate));
    });
    // T3 explicitly permits a compatibility-only edit to this existing skill.
    if (owned.includes('workflow-retro') && owned.includes('compatibility')) patterns.push('.claude/skills/workflow-retro/SKILL.md');
    return { id: match[1], dependencies, patterns };
  });
  if (!tasks.length) throw new Error('no T-number task headings found');
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  if (taskMap.size !== tasks.length) throw new Error('duplicate task IDs');
  const visited = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error(`dependency cycle at ${id}`);
    if (visited.has(id)) return;
    if (!taskMap.has(id)) throw new Error(`unknown dependency ${id}`);
    visiting.add(id);
    for (const dependency of taskMap.get(id).dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const task of tasks) visit(task.id);
  const ready = tasks.filter((task) => task.dependencies.length === 0);
  for (let i = 0; i < ready.length; i += 1) {
    for (let j = i + 1; j < ready.length; j += 1) {
      for (const a of ready[i].patterns) for (const b of ready[j].patterns) {
        check(!pathsMayOverlap(a, b), `initial ownership overlap: ${ready[i].id} ${a} / ${ready[j].id} ${b}`);
      }
    }
  }
  console.log(`Dry run: ${tasks.length} tasks; initial ready set ${ready.map((task) => task.id).join(', ')}; maximum dispatch 3.`);
  console.log('Initial ready-task owned paths expanded and checked conservatively; later tasks remain dependency-gated.');
  console.log('Prose/range dependencies are conservative; this is an initial audit, not runtime execution or full-plan proof.');
}

function selfTest() {
  const valid = '---\nname: example\ndescription: "Example"\ntools:\n  - Read\n---\nBody';
  assert.equal(frontmatter(valid, 'fixture').values.tools[0], 'Read');
  assert.throws(() => frontmatter(valid.replace('name: example', 'name: example\nname: duplicate'), 'fixture'), /duplicate/);
  assert.throws(() => frontmatter(valid.replace('  - Read', ' - Read'), 'fixture'), /unsupported YAML/);
  assert.equal(pathsMayOverlap('server/src/**', 'server/src/modules/a.ts'), true);
  assert.equal(pathsMayOverlap('*/src/contracts/a.ts', 'client/src/contracts/b.ts'), false);
  assert.equal(pathsMayOverlap('client/[id]/**', 'client/[other]/a.ts'), false);
  assert.deepEqual(expandBraces('a/{b,c}/{d,e}'), ['a/b/d', 'a/b/e', 'a/c/d', 'a/c/e']);
  assert.equal(pathsMayOverlap('server/test/intent*.test.ts', 'server/test/project-context*.test.ts'), false);
  assert.equal(pathsMayOverlap('server/test/intent*.test.ts', 'server/test/*-fixture.test.ts'), true);
  console.log('Checker self-test: 9 parser/ownership assertions passed.');
}

try {
  const args = process.argv.slice(2);
  const allowed = args.filter((arg) => arg !== '--self-test');
  if (allowed.length && (allowed.length !== 2 || allowed[0] !== '--dry-run-plan')) {
    throw new Error('usage: node scripts/check-development-agents.mjs [--self-test] [--dry-run-plan <repo-relative-plan>]');
  }
  if (args.includes('--self-test')) selfTest();
  validateProfiles();
  validateWorkflow();
  if (allowed.length) dryRunPlan(allowed[1]);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Development-agent check passed: ${names.length} profiles, metadata/skill references, six read-only allowlists, registry and workflow boundaries.`);
  console.log('Static validation only; actual agent/model execution, product acceptance and resource usage remain unverified here.');
} catch (error) {
  console.error(`Development-agent check failed:\n${error.message}`);
  process.exitCode = 1;
}
