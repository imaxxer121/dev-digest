# L07 implementation plan

1. Import the course runner from upstream/lesson-7-lab/agent-runner without merging
   unrelated upstream application code. Validate the unmodified runner package.
2. Commit two specifications before feature code. Create two Git worktrees from
   that shared base and dispatch independent implementation agents simultaneously.
3. A implements persistent parallel review and comparison; B implements export,
   hosted runner and verified CI ingestion. Root owns integration/evidence/demo.
4. Independently review/typecheck/test each feature. Integrate A before B and
   reconcile only declared integration/migration files. Keep two feature PRs.
5. Compare real one-agent and three-agent reviews on the same PR, exercise failure
   recovery, install CI via a separate PR, observe hosted model review and required
   check, ingest authenticated artifacts, then record a real browser demo.
6. Apply manual pr-self-review/engineering-insights and workflow retrospective;
   publish actual evidence and submit L07 in GoIT.

The course runner is infrastructure, not a complete CI feature. Current executor
is sequential despite its comment claiming fan-out. CI module and multi-agent
screens are absent; existing tables/contracts/UI primitives are available.
The user cannot provide an API key. GitHub Models retired July 30, 2026, so hosted
Ollama is an explicit alternate inference mode, to be proved by an actual CI run.

Sources: the GoIT L07 lab and homework, upstream course runner; current official
GitHub retirement notice and Ollama chat/structured-output/Linux documentation.
