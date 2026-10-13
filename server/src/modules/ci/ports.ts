/** Only the authenticated adapter can produce this envelope; public JSON is never ingested. */
export interface CiArtifactEnvelope {
  runId: number; attempt: number; repositoryId: number; repo: string;
  event: string; status: string; workflowPath: string; workflowSha: string;
  headSha: string; prNumber: number; workflow: string; artifact: unknown;
  htmlUrl: string; createdAt: string;
  trustedFileDigests: Record<string, string>;
}
export interface CiGithubPort { retrieve(repo: string, runId: number, paths: string[]): Promise<CiArtifactEnvelope>; }
export interface CiDependencies { ciGithub(): Promise<CiGithubPort>; ciRunner(): Promise<Record<string, string>>; }
