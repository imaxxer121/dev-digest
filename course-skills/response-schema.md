# API response schema

Compare response field names, JSON types, requiredness, nullability, envelopes and status codes with the existing contract. Report a changed line only when it demonstrates a concrete consumer mismatch. Recommend preserving the shared DTO and a regression test.

Good: Return `{ id: string, displayName: string }` consistently on every successful v1 profile response.

Bad: Returning `{ id: number, name: string }` violates the required string id and displayName schema.
