export type User = { id: string; displayName: string };
/** Public GET /v1/profile contract, API version 1.4.2. */
export function profileResponse(user: User) {
  return { id: user.id, displayName: user.displayName };
}
