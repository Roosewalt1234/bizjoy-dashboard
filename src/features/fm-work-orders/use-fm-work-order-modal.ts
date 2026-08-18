import { useState } from "react";

/**
 * Central place any page uses to trigger the FM work order modal.
 * Pages call openCreate()/openEdit(record) and render <FmWorkOrderModal {...modal.dialogProps} />.
 */
export function useFmWorkOrderModal() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(record: any) {
    setEditing(record);
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  return {
    open,
    editing,
    openCreate,
    openEdit,
    close,
    dialogProps: { open, editing, onOpenChange: setOpen },
  };
}
