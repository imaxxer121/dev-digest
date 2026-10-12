"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SectionLabel, Skeleton } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";

interface ContextEditorProps {
  files: SpecFile[];
  loading: boolean;
  loadError?: Error | null;
  pending: boolean;
  saveError?: Error | null;
  onRetry: () => void;
  onSave: (input: { path: string; content: string }) => Promise<SpecFile>;
  onResetError: () => void;
}

const inputStyle: React.CSSProperties = { width: "100%", padding: 10, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-surface)", color: "var(--text-primary)" };

export function ContextEditor({ files, loading, loadError, pending, saveError, onRetry, onSave, onResetError }: ContextEditorProps) {
  const t = useTranslations("context");
  const [path, setPath] = React.useState("");
  const [content, setContent] = React.useState("");
  const [validation, setValidation] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const edit = (file?: SpecFile) => {
    setPath(file?.path ?? "");
    setContent(file?.content ?? "");
    setValidation(null);
    setSaved(null);
    onResetError();
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setValidation(null);
    setSaved(null);
    if (!path || path.length > 256 || /^(?:\/|[A-Za-z]:)/.test(path) || /[\\\u0000-\u001f\u007f]/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) {
      setValidation(t("editor.invalidPath"));
      return;
    }
    if (!content.trim() || new TextEncoder().encode(content).length > 65536) {
      setValidation(t("editor.invalidContent"));
      return;
    }
    try {
      const result = await onSave({ path, content });
      setPath(result.path);
      setContent(result.content ?? content);
      setSaved(result.path);
    } catch {
      // The route's mutation error is shown below; retain the draft for retry.
    }
  };

  return <div style={{ display: "grid", gap: 24 }}>
    <section aria-label={t("savedFiles")}>
      <SectionLabel icon="FileText">{t("savedFiles")}</SectionLabel>
      {loading && <div role="status"><p>{t("loading")}</p><Skeleton height={72} /></div>}
      {loadError && <div role="alert"><p>{t("loadError")}: {loadError.message}</p><Button kind="secondary" size="sm" onClick={onRetry}>{t("retry")}</Button></div>}
      {!loading && !loadError && files.length === 0 && <div><strong>{t("empty.title")}</strong><p style={{ color: "var(--text-muted)" }}>{t("empty.body")}</p></div>}
      <ul style={{ padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
        {files.map((file) => <li key={file.path} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
          <span className="mono" style={{ flex: 1, overflowWrap: "anywhere" }}>{file.path}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("bytes", { count: file.size ?? 0 })}</span>
          <Button kind="secondary" size="sm" disabled={pending} aria-label={t("editFile", { path: file.path })} onClick={() => edit(file)}>{t("mode.edit")}</Button>
        </li>)}
      </ul>
    </section>
    <section aria-label={t("editor.title")}>
      <SectionLabel icon="FileText" right={<Button kind="ghost" size="sm" disabled={pending} onClick={() => edit()}>{t("newFile")}</Button>}>{t("editor.title")}</SectionLabel>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <label>{t("editor.path")}<input value={path} disabled={pending} style={inputStyle} placeholder={t("editor.pathPlaceholder")}
          onChange={(event) => { setPath(event.target.value); setSaved(null); setValidation(null); }} /></label>
        <p style={{ fontSize: 12, margin: 0, color: "var(--text-muted)" }}>{t("editor.pathHint")}</p>
        <label>{t("editor.content")}<textarea value={content} disabled={pending} style={{ ...inputStyle, minHeight: 280, fontFamily: "var(--font-mono)" }}
          onChange={(event) => { setContent(event.target.value); setSaved(null); setValidation(null); }} /></label>
        {validation && <p role="alert" style={{ color: "var(--crit)" }}>{validation}</p>}
        {saveError && <p role="alert" style={{ color: "var(--crit)" }}>{t("editor.saveError")}: {saveError.message}</p>}
        {saved && <p role="status">{t("editor.saved", { path: saved })}</p>}
        {pending && <p role="status">{t("editor.saving")}</p>}
        <div><Button type="submit" kind="primary" loading={pending} disabled={!path || !content.trim()}>{t(pending ? "editor.saving" : "editor.save")}</Button></div>
      </form>
    </section>
  </div>;
}
