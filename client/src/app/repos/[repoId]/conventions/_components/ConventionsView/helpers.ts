import type { ConventionCandidate } from "@devdigest/shared";

export function acceptedSkillDraft(candidates: ConventionCandidate[]): string {
  return "# Repository conventions\n\n" + candidates.filter(c => c.status === "accepted")
    .map(c => `## ${c.category}\n\n${c.rule}\n\nEvidence: \`${c.evidence_path}:${c.evidence_line}\`\n\n\`\`\`\n${c.evidence_snippet}\n\`\`\``).join("\n\n");
}
