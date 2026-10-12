"use client";
import React from "react";
import { Modal, Button } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";

export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState("");
  const style = { width: "100%", background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: 10 };
  return <Modal title="Create Skill" onClose={onClose} width={640}
    footer={<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button kind="secondary" onClick={onClose}>Cancel</Button>
      <Button kind="primary" disabled={!name.trim() || !body.trim()} loading={create.isPending}
        onClick={() => create.mutate({ name: name.trim(), description, type, body }, { onSuccess: onClose })}>Create</Button>
    </div>}>
    <div style={{ padding: 24, display: "grid", gap: 14 }}>
      <label>Name<input aria-label="Skill name" style={style} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Description<input aria-label="Skill description" style={style} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label>Type<select aria-label="Skill type" style={style} value={type} onChange={e => setType(e.target.value as SkillType)}>
        {["custom", "rubric", "security", "convention"].map(v => <option key={v}>{v}</option>)}
      </select></label>
      <label>Markdown body<textarea aria-label="Skill body" style={style} rows={10} value={body} onChange={e => setBody(e.target.value)} /></label>
      {create.error && <p role="alert">{create.error.message}</p>}
    </div>
  </Modal>;
}
