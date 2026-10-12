import { BriefOutput } from '@devdigest/shared';

export function groundBrief(raw: unknown, allowed: ReadonlySet<string>) {
  const output = BriefOutput.parse(raw);
  let discarded_refs = 0, discarded_risks = 0, discarded_focus = 0;
  const risks = output.risks.flatMap(risk => {
    const file_refs = [...new Set(risk.file_refs.filter(path => { if (allowed.has(path)) return true; discarded_refs++; return false; }))];
    if (!file_refs.length) { discarded_risks++; return []; }
    return [{ ...risk, file_refs }];
  });
  const seen = new Set<string>();
  const review_focus = output.review_focus.filter(f => {
    const key = JSON.stringify([f.file, f.line]);
    if (!allowed.has(f.file) || seen.has(key)) { discarded_focus++; return false; }
    seen.add(key); return true;
  });
  return { summary: output.summary, risks, review_focus, counts: { discarded_refs, discarded_risks, discarded_focus } };
}
