import { dbStatus } from '../db/status.mjs';

export function readHealth() {
  return { status: dbStatus() };
}
