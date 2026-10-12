---
name: pr-self-review
description: Review a DevDigest diff before a commit or pull request; dispatch frontend and server checks based on affected paths.
---

Inspect git diff and changed paths. For client files, read frontend-architecture/SKILL.md; for server files, read onion-architecture/SKILL.md. Mixed diffs must use both. Check behavior, workspace scoping, contract copies, missing evidence, accessibility and meaningful tests. Run only relevant checks and record actual results plus file:line notes. Do not install or enable a git push hook; invocation is manual. This workflow does not invent model outputs or authorize unrelated actions.
