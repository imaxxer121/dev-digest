# API backward compatibility

Compare public contracts before and after the diff. Flag removal or rename at an unchanged API version; explain a concrete consumer failure and recommend an additive alias or versioned migration.

Good: `{ displayName, name: displayName }` preserves old v1 consumers.

Bad: Replacing `{ displayName }` with `{ name }` on `/v1/profile` removes an existing public field.
