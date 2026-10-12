# L01 severity-filter demo

[Watch the demo](assets/l01-severity-demo.mp4).

The recording shows the actual local interface on seeded PR #482: all findings,
CRITICAL, WARNING, an empty SUGGESTION category, reset to All and the restored
list. It was captured from browser frames at 5 fps and encoded as MP4.
The fixture has 1 CRITICAL, 1 WARNING and 0 SUGGESTION findings.

Validation completed on 2026-10-12:

- Client TypeScript check and 26 component tests passed.
- Server TypeScript check and 101 unit tests passed.
- Browser selection, repeat-click reset, empty category, keyboard Enter and
  a 768 px viewport checked; temporary viewport override reset afterward.
- Local `agent_runs` count stayed 0 before and after filtering.
- Engineering-insights skill metadata validated and module notes recorded.

The starter shell has a fixed sidebar and is not suitable for a 375 px phone
viewport. DB integration tests and real reviewer/Claude Code comparison were
not run. The comparison needs model access; this demo is not model-quality
evidence.
