# Deliberate Context rule fixture

This standalone, offline fixture demonstrates a documented import-boundary
violation. It is never imported by the application. `api/health.mjs` deliberately
imports `db/status.mjs`; the selected document under `docs/course-context/`
forbids that direct dependency. The expected review cites both locations and
does not claim a real SQL injection or production vulnerability.
