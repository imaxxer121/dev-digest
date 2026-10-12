"use client";
import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SearchableSelect } from "@devdigest/ui";
import { useSettings, useUpdateSettings } from "@/lib/hooks";
import { useProviderModels } from "@/lib/hooks/agents";
import { toModelOptions } from "@/lib/model-label";
import { FEATURE_MODELS } from "@/lib/feature-models";
import type { FeatureModelChoice, FeatureModelId, FeatureModelDef, Provider } from "@/lib/types";
import { SectionTitle } from "../SectionTitle";
import { s } from "./styles";
function ModelRow({feature, choice, onChange}: {feature: FeatureModelDef; choice: FeatureModelChoice; onChange: (choice:FeatureModelChoice) => void}) {
  const t = useTranslations("settings");
  const [provider, setProvider] = React.useState(choice.provider);
  React.useEffect(() => setProvider(choice.provider), [choice.provider]);
  const {data: models, isLoading, error} = useProviderModels(provider);
  const options = toModelOptions(models);
  const current = provider === choice.provider ? choice.model : "";
  if (current && !options.some(o => (typeof o === "string" ? o : o.value) === current)) options.unshift(current);
  return <div style={s.row}><FormField label={feature.label} hint={feature.description}>
    <select aria-label={`${feature.label} provider`} value={provider} onChange={e => setProvider(e.target.value as Provider)} style={{padding:10,marginBottom:8,background:"var(--bg-surface)",color:"var(--text-primary)",border:"1px solid var(--border)",borderRadius:6}}>
      {["openai","anthropic","openrouter","codex"].map(p => <option key={p}>{p}</option>)}
    </select>
    <SearchableSelect value={current} onChange={model => onChange({provider,model})} options={options} placeholder={isLoading ? "Loading models…" : t("models.search")} />
    {error && <p role="alert">{error.message}</p>}
  </FormField></div>;
}
export function SettingsModels() {
  const t = useTranslations("settings");
  const {data: settings} = useSettings();
  const update = useUpdateSettings();
  const chosen = (settings?.feature_models ?? {}) as Partial<Record<FeatureModelId,FeatureModelChoice>>;
  return <div style={s.wrap}><SectionTitle title={t("models.title")} body={t("models.body")} />
    {FEATURE_MODELS.map(feature => <ModelRow key={feature.id} feature={feature} choice={chosen[feature.id] ?? {provider:feature.defaultProvider,model:feature.defaultModel}} onChange={choice => update.mutate({feature_models:{...chosen,[feature.id]:choice}})} />)}
    {update.error && <p role="alert">{update.error.message}</p>}
  </div>;
}
