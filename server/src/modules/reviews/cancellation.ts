export class RunCancelledError extends Error {
  constructor() { super('Run cancelled'); this.name = 'RunCancelledError'; }
}
