# L06 harness eval completion

Date: 2026-10-16. The accepted product eval implementation remains intact.
This additive scope completes the mentor's missing harness lab. User explicitly
selected existing Codex subscription because no Claude account/API key is available.

The repository SHALL have a self-contained evals package with its own cases,
static quality, skill, agent and workflow suites (AC-E01).
The harness SHALL make real model runs an explicit opt-in separate from default
deterministic verification and require bounded timeout/concurrency (AC-E02).
The runtime SHALL use actual Codex JSON events for observable tool calls, usage
and delegation, preserving raw evidence; missing telemetry SHALL be unknown,
not inferred from prose (AC-E03).
Read-only model scenarios SHALL run in a physical read-only sandbox without
network or inherited credentials in model-visible env; no bypassPermissions
or unrestricted autoapproval is permitted (AC-E04).
Cases SHALL cover realistic positive/negative activation, required source reads,
tool/delegation behavior and artifacts; a fixture pass SHALL not be reported as
real inference evidence (AC-E05).
The default CI SHALL block on static quality and meaningful adapter tests; model
workflow jobs SHALL be manual/opt-in, not request secrets from forks or assume
GitHub runners have subscribed CLI auth (AC-E06).
CLAUDE.md SHALL route the four eval commands and distinguish the existing product
eval module from this development harness package (AC-E07).
Reports SHALL preserve trial count/failures, repeated-run metrics, nullable billed
USD and documented limitations, with no fabricated Claude/model successes (AC-E08).

Exclusions: optional UI lab refinements and any video/course upload during hold.

## AC-E04 platform isolation addendum (root decision, 2026-10-16)

Strict OS snapshot-read/no-network isolation remains the default and fails
closed when unsupported. Observed native Windows CLI sandboxing requires root
read access, MXC is unavailable on this executor, and a fixed probe found
loopback connectivity despite disabled command-network configuration. These
results must remain explicit and must not be relabeled as strict isolation.

For the root's explicitly authorized, nonsecret staged coursework fixtures only,
`--isolation mcp-readonly` may opt into a narrower application/tool-surface
boundary: physical read-only writes plus fixed allowlisted MCP list/read tools,
with fresh canonical/link/byte/digest checks and no arbitrary command, filesystem,
environment or URL tool. Disable shell, images, apps, plugins, hooks and web tools
where supported. CLI subscription authentication remains in the parent and is
never copied into the snapshot or exposed by MCP. This mode claims neither OS
read isolation nor OS network denial; record the selected mode, actual canary
results and limitations in every trial. Strict failures remain visible.

MCP traversal, link, oversized and outside-canary reads must be rejected. A fixed
physical write canary must be denied. If an apply-patch tool remains exposed,
physical read-only policy must refuse its harmless snapshot write canary; the
root verifies that behavior during its separately owned live runtime evidence.
No inference is authorized for the delegated implementer by this addendum.
