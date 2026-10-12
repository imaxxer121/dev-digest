---
name: engineering-insights
description: Record verified, reusable discoveries in DevDigest module INSIGHTS.md files after implementing and validating a coding task. Also use when explicitly asked to capture engineering insights from a completed session.
---

Capture facts that save a future coding session from rediscovering a dependency,
platform quirk or tested behavior. Put the note in the affected module's
`INSIGHTS.md` (client, server or reviewer-core); use the root for cross-package
discoveries. Read existing entries and extend one if it already covers the fact.

Each entry includes the date, the discovery, its practical consequence and
evidence as `path:line` plus the exact test or command result when relevant.
Prefer one compact entry for a related group of findings. Check line numbers
against the final files.

Distinguish observed facts from hypotheses. Only record tests actually run and
outcomes actually seen. Do not turn seeded fixtures or mock results into claims
about real model quality. Omit secrets, personal paths and routine change lists.

This skill records local notes only. It does not authorize commits, model calls
or submissions. If automatic selection misses it, invoke it manually after the
task's validation.
