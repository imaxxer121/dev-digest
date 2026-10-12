# API deprecation policy

For replaced public fields and endpoints, check whether the old contract remains usable during a documented transition. Flag silent removal without an alias, deprecation notice and removal version. Recommend an additive replacement and a clear migration window. Ground every finding in supplied changed lines.

Good: Keep displayName alongside name, mark the old field deprecated in API docs, and schedule removal for v2.

Bad: Silently drop displayName from the current v1 response with no migration period.
