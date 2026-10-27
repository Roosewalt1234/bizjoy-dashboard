/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Loader2, MessageCircleOff } from "lucide-react";
import { toast } from "sonner";
import { assignFmWorkOrder, listAssignableStaff } from "./fm-work-orders-api";

/**
 * "Assign work order" picker: lists the staff allocated to the work order's FM contract and
 * assigns the chosen one. Saving queues the WhatsApp alerts (worker + Parkside group).
 */
export function AssignWorkOrderDialog({
  order,
  onClose,
}: {
  order: any | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);

  const {
    data: staff = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["fm-work-order-assignable-staff", order?.id],
    queryFn: () => listAssignableStaff(order.id),
    enabled: Boolean(order?.id),
  });

  async function assign(employeeId: string) {
    setSavingId(employeeId);
    try {
      const res = await assignFmWorkOrder(order, employeeId);
      if (!res.changed) toast.info(`Already assigned to ${res.technician_name}`);
      else if (res.has_whatsapp)
        toast.success(`Assigned to ${res.technician_name}. WhatsApp alert queued.`);
      else
        toast.warning(
          `Assigned to ${res.technician_name}. No WhatsApp number on file, so only the group is told.`,
        );
      qc.invalidateQueries({ queryKey: ["fm_work_orders"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Assign failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Dialog
      open={Boolean(order)}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign work order {order?.wo_no ? `#${order.wo_no}` : ""}</DialogTitle>
          <DialogDescription>
            {(order?.fm_contracts?.contract_no ?? order?.fm_contracts?.title)
              ? `Staff allocated to ${order.fm_contracts.contract_no ?? order.fm_contracts.title}`
              : "Staff allocated to this work order's contract"}
          </DialogDescription>
        </DialogHeader>
        {!order?.contract_id ? (
          <p className="text-sm text-muted-foreground">
            This work order has no FM contract, so there is no allocated staff to pick from.
          </p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading staff...
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">
            {(error as any).message ?? "Could not load staff"}
          </p>
        ) : staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No staff are allocated to this contract. Add them under Contracts &gt; Manpower.
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto divide-y rounded-md border">
            {staff.map((s) => (
              <button
                key={s.employee_id}
                type="button"
                disabled={savingId !== null}
                onClick={() => assign(s.employee_id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted disabled:opacity-60"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.role_name ?? "—"}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!s.has_whatsapp && (
                    <Badge variant="outline" className="gap-1 text-muted-foreground">
                      <MessageCircleOff className="h-3 w-3" /> No WhatsApp
                    </Badge>
                  )}
                  {s.is_current && (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" /> Assigned
                    </Badge>
                  )}
                  {savingId === s.employee_id && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose} disabled={savingId !== null}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
