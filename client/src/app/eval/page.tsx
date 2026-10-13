"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { EvalDashboard } from "./_components/EvalDashboard";

export default function EvalDashboardPage() {
  const t = useTranslations("eval.page");
  return <AppShell crumb={[{ label: t("crumbSkillsLab") }, { label: t("crumbEvalDashboard") }]}><EvalDashboard /></AppShell>;
}
