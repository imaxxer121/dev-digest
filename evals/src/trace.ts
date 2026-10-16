import type { ManifestEntry, ParsedTrace } from './types.js';
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const toolTypes = new Set(['command_execution', 'mcp_tool_call', 'collab_tool_call', 'web_search', 'file_change']);
const collabTools = new Set(['spawn_agent', 'wait', 'send_input', 'resume_agent', 'close_agent', 'list_agents', 'wait_agent', 'send_message', 'interrupt_agent', 'followup_task']);

/** Parse only actual emitted events. Prose never supplies reads, tools, spawn or usage. */
export function parseTrace(raw: string, manifest: ManifestEntry[] = []): ParsedTrace {
  const result: ParsedTrace = { text: '', tools: [], reads: [], delegations: [], writes: [], failures: [], unknownEvents: [], malformedLines: 0,
    completedTurns: 0, inputTokens: null, cachedInputTokens: null, outputTokens: null, delegationTelemetry: 'unknown', billedUsd: null, toolTelemetryComplete: false,
    rootTelemetry: { scope: 'emitted_root_actions', complete: false, toolCalls: null, spawnCalls: null, descendantActions: 'unknown' } };
  const completed = new Map<string, Record<string, any>>();
  const observed = new Map<string, Record<string, any>>();
  const usage: Record<string, unknown>[] = [];
  const unfinished = new Set<string>();
  let openTurns = 0;
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    let event: Record<string, any>;
    try { event = JSON.parse(line); if (!event || typeof event !== 'object' || typeof event.type !== 'string') throw new Error(); }
    catch { result.malformedLines++; continue; }
    if (event.type === 'turn.started') openTurns++;
    else if (event.type === 'turn.completed') { result.completedTurns++; usage.push(event.usage ?? {}); openTurns = Math.max(0, openTurns - 1); }
    else if (event.type === 'turn.failed' || event.type === 'error') result.failures.push(String(event.error?.message ?? event.message ?? 'Codex turn failed'));
    else if (['item.started', 'item.updated', 'item.completed'].includes(event.type) && event.item && typeof event.item.type === 'string') {
      const id = String(event.item.id ?? `unidentified-${observed.size}`);
      if (observed.has(id) && observed.get(id)!.type !== event.item.type) result.unknownEvents.push(`item:${id}:changed-type`);
      observed.set(id, event.item);
      if (typeof event.item.id !== 'string' || !event.item.id) result.unknownEvents.push('item:missing-id');
      if (event.type === 'item.completed') { completed.set(id, event.item); unfinished.delete(id); }
      else if (toolTypes.has(event.item.type)) unfinished.add(id);
      if (toolTypes.has(event.item.type) && event.item.status === 'in_progress') unfinished.add(id);
    }
    else if (event.type !== 'thread.started') result.unknownEvents.push(event.type);
  }
  const sum = (field: string) => usage.length && usage.every(u => numeric(u[field])) ? usage.reduce((total, u) => total + Number(u[field]), 0) : null;
  result.inputTokens = sum('input_tokens'); result.cachedInputTokens = sum('cached_input_tokens'); result.outputTokens = sum('output_tokens');
  for (const [id, item] of observed) {
    if (toolTypes.has(item.type)) result.tools.push({ id, type: item.type, ...(typeof item.command === 'string' ? { command: item.command } : {}), ...(typeof item.status === 'string' ? { status: item.status } : {}) });
    if (!toolTypes.has(item.type) && !['agent_message', 'reasoning', 'todo_list'].includes(item.type)) result.unknownEvents.push(`item:${item.type}`);
    if (item.type === 'collab_tool_call' && !collabTools.has(item.tool ?? item.tool_name)) result.unknownEvents.push(`collab_tool:${item.tool ?? item.tool_name ?? 'missing'}`);
  }
  for (const [id, item] of completed) {
    if (item.type === 'agent_message' && typeof item.text === 'string') result.text = item.text;
    if (item.type === 'file_change' && item.status !== 'failed') result.writes.push(id);
    if (item.type === 'mcp_tool_call' && item.server === 'eval_files' && item.tool === 'read_document' && item.status === 'completed' && !item.error && !item.result?.isError) {
      const values: any[] = [];
      if (item.result?.structuredContent) values.push(item.result.structuredContent);
      for (const block of item.result?.content ?? []) if (block.type === 'text') { try { values.push(JSON.parse(block.text)); } catch { /* not structured read evidence */ } }
      const evidence = values.find(read => manifest.some(file => file.staged === item.arguments?.path && file.staged === read.path && file.sha256 === read.sha256 && file.bytes === read.bytes));
      if (evidence) {
        const known = manifest.find(file => file.staged === evidence.path)!;
        result.reads.push({ path: known.source, sha256: evidence.sha256, bytes: evidence.bytes, itemId: id, method: 'verified_mcp_read' });
      }
    }
    if (item.type === 'collab_tool_call') {
      result.delegationTelemetry = 'observed';
      const tool = item.tool ?? item.tool_name;
      // wait/send/close are real tools, but are not evidence of a spawn.
      if (tool === 'spawn_agent' && item.status === 'completed') result.delegations.push({ id, tool, role: typeof item.agent_type === 'string' ? item.agent_type : typeof item.arguments?.agent_type === 'string' ? item.arguments.agent_type : null, status: item.status });
    }
    if (item.type === 'command_execution' && item.exit_code === 0 && item.status === 'completed' && typeof item.command === 'string' && typeof item.aggregated_output === 'string') {
      // Only the immutable staged helper channel is credited. Arbitrary shell
      // reads remain visible in raw trace, with no inferred file-read success.
      const cmd = item.command;
      const helper = /(?:^|[\s"'])node(?:\.exe)?["']?\s+["']?\.harness[\/]read\.mjs["']?\s+/i.test(cmd);
      if (!helper || /[;|&\r\n`]|\$\(|\b(?:echo|printf|Write-Output)\b/i.test(cmd)) continue;
      for (const line of item.aggregated_output.split(/\r?\n/)) if (line.startsWith('HARNESS_READ ')) {
        try {
          const read = JSON.parse(line.slice(13));
          const known = manifest.find(file => file.staged === read.path && file.sha256 === read.sha256 && file.bytes === read.bytes);
          if (known) result.reads.push({ path: known.source, sha256: read.sha256, bytes: read.bytes, itemId: id, method: 'verified_helper_command' });
        } catch { /* malformed marker cannot become evidence */ }
      }
    }
  }
  result.toolTelemetryComplete = result.completedTurns > 0 && result.failures.length === 0 && result.malformedLines === 0 && result.unknownEvents.length === 0 && unfinished.size === 0 && openTurns === 0;
  // A complete recognized root stream supports counts of emitted root actions,
  // even when no collaboration event exists. It never proves descendant activity
  // or that collaboration capability metadata was emitted.
  result.rootTelemetry = { scope: 'emitted_root_actions', complete: result.toolTelemetryComplete,
    toolCalls: result.toolTelemetryComplete ? result.tools.length : null,
    spawnCalls: result.toolTelemetryComplete ? [...observed.values()].filter(item => item.type === 'collab_tool_call' && (item.tool ?? item.tool_name) === 'spawn_agent').length : null,
    descendantActions: 'unknown' };
  return result;
}
