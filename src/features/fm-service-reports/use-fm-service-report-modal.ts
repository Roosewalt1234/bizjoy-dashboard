import { useState } from "react";

/** Central place any page uses to trigger the FM service report modal. */
export function useFmServiceReportModal() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [prefillWorkOrderId, setPrefillWorkOrderId] = useState<string | null>(null);

  function openCreate(prefillWorkOrder?: string | null) {
    setEditing(null);
    setPrefillWorkOrderId(prefillWorkOrder ?? null);
    setOpen(true);
  }

  function openEdit(record: any) {
    setEditing(record);
    setPrefillWorkOrderId(null);
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  return {
    open,
    editing,
    prefillWorkOrderId,
    openCreate,
    openEdit,
    close,
    dialogProps: { open, editing, prefillWorkOrderId, onOpenChange: setOpen },
  };
}
