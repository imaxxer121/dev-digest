"use client";
import React from "react";
import { Modal, Button } from "@devdigest/ui";

export function ConfirmDeleteDialog({ name, pending, error, onClose, onConfirm }: {
  name: string; pending: boolean; error?: string; onClose: () => void; onConfirm: () => void;
}) {
  return <Modal width={440} title={`Delete ${name}?`} onClose={pending ? undefined : onClose}
    footer={<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button kind="secondary" disabled={pending} onClick={onClose}>Cancel</Button>
      <Button kind="danger" loading={pending} onClick={onConfirm}>Delete</Button>
    </div>}>
    <div style={{ padding: 24 }}>This removes the saved item and its links. {error && <p role="alert">{error}</p>}</div>
  </Modal>;
}
