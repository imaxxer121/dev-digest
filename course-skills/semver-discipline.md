# API semver discipline

For public API changes, identify whether old consumers still work unchanged. If a response field or endpoint is removed or renamed, flag an unchanged or minor-only version as insufficient; recommend a major version or explicitly versioned endpoint and migration notes. Do not demand major bumps for additive optional fields.

Good: Expose the renamed response under `/v2/profile`, keep v1 compatible, and document migration.

Bad: Rename displayName to name while keeping `/v1/profile` and version 1.4.2.
