import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "errors",
  evidence_line: 4,
  status: "pending",
  rule: "Wrap fetch calls in withTimeout",
  evidence_path: "src/platform/resilience.ts",
  evidence_snippet: "export function withTimeout(...)",
  confidence: 0.9,
  accepted: false,
};

describe("ConventionCard (smoke)", () => {
  it("renders the rule, evidence and Accept action", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(<ConventionCard c={CANDIDATE} onUpdate={onUpdate} pending={false} evidenceUrl="https://github.com/acme/payments-api/blob/main/src/platform/resilience.ts#L4" />);
    expect(screen.getByText("Wrap fetch calls in withTimeout")).toBeInTheDocument();
    expect(screen.getByText("src/platform/resilience.ts:4")).toBeInTheDocument();
    expect(screen.getByRole("link", {name:"src/platform/resilience.ts:4"})).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/main/src/platform/resilience.ts#L4");
    const btn = screen.getByText("Accept");
    await act(async () => fireEvent.click(btn));
    expect(onUpdate).toHaveBeenCalledWith({status:"accepted"});
  });

  it("shows the accepted state", () => {
    renderWithIntl(<ConventionCard c={{ ...CANDIDATE, status:"accepted", accepted: true }} onUpdate={async () => {}} pending={false} />);
    expect(screen.getByRole("button", {name:"Accept"})).toBeDisabled();
  });
  it("rejects and edits a candidate independently of creating a Skill", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(<ConventionCard c={CANDIDATE} onUpdate={onUpdate} pending={false} />);
    await act(async () => fireEvent.click(screen.getByRole("button", {name:"Reject"})));
    expect(onUpdate).toHaveBeenCalledWith({status:"rejected"});
    fireEvent.click(screen.getByRole("button", {name:"Edit"}));
    fireEvent.change(screen.getByLabelText("Rule"), {target:{value:"Handle timeouts explicitly"}});
    await act(async () => fireEvent.click(screen.getByRole("button", {name:"Save"})));
    expect(onUpdate).toHaveBeenCalledWith({rule:"Handle timeouts explicitly", category:"errors"});
  });
});
