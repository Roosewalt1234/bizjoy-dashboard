import { useState } from "react";

/**
 * Central place any page uses to trigger the FM contract modal.
 * Pages call openCreate()/openEdit(record) and render <FmContractModal {...modal.dialogProps} />.
 * The modal owns its own field state and save logic - this hook only owns open/closed + which
 * record (if any) is being edited, so pages never have to know how the form works.
 */
export function useFmContractModal() {
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
