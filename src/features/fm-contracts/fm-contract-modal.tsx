import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FM_SCOPE_TYPES, BILLING_CYCLES, PAYMENT_TERMS, STATUS_OPTIONS, PAY_STATUS,
  type PaymentTerm, type FmContractPaymentRow,
  saveFmContract, fetchFmContractPayments, addYearMinusDay, generatePaymentSchedule, computePaymentStatus,
} from "./fm-contracts-api";

type FmContractModalProps = {
  open: boolean;
  editing: any | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

/**
 * The one FM contract create/edit modal. Lives here, shared feature folder, and used by
 * every page that needs to create or edit an FM contract - it never knows which page
 * triggered it and never branches on AMC vs FM (this whole feature is FM-only).
 */
export function FmContractModal({ open, editing, onOpenChange, onSaved }: FmContractModalProps) {
  const qc = useQueryClient();

  const [contractNo, setContractNo] = useState(editing?.contract_no ?? "");
  const [customerId, setCustomerId] = useState<string | null>(editing?.customer_id ?? null);
  const [customerName, setCustomerName] = useState<string>(editing?.customer_name ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [contractScopeType, setContractScopeType] = useState<string>(editing?.contract_scope_type ?? "Facilities Management");
  const [siteName, setSiteName] = useState(editing?.site_name ?? "");
  const [siteAddress, setSiteAddress] = useState(editing?.site_address ?? "");
  const [buildingType, setBuildingType] = useState(editing?.building_type ?? "");
  const [billingCycle, setBillingCycle] = useState<string>(editing?.billing_cycle ?? "");
  const [retentionPercent, setRetentionPercent] = useState(editing?.retention_percent != null ? String(editing.retention_percent) : "");
  const [vatPercent, setVatPercent] = useState(editing?.vat_percent != null ? String(editing.vat_percent) : "");
  const [contractManagerId, setContractManagerId] = useState<string>(editing?.contract_manager_id ?? "none");
  const [slaProfileId, setSlaProfileId] = useState<string>(editing?.sla_profile_id ?? "none");
  const [value, setValue] = useState<string>(editing?.value != null ? String(editing.value) : "");
  const [startDate, setStartDate] = useState(editing?.start_date ?? "");
  const [endDate, setEndDate] = useState(editing?.end_date ?? "");
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm | "">(editing?.payment_terms ?? "");
  const [status, setStatus] = useState(editing?.status ?? "Draft");
  const [remark, setRemark] = useState(editing?.remark ?? "");
  const [payments, setPayments] = useState<FmContractPaymentRow[]>([]);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!editing?.id) { setPayments([]); return; }
      setPayments(await fetchFmContractPayments(editing.id));
    })();
  }, [editing?.id]);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, display_name, company_name")
        .order("display_name", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contractManagers = [] } = useQuery({
    queryKey: ["contract-managers-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, first_name, last_name")
        .order("full_name", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: slaProfiles = [] } = useQuery({
    queryKey: ["sla-profiles-lookup"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sla_policies")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const canGenerate = paymentTerms && startDate;
  function regenerateSchedule() {
    if (!canGenerate) return;
    setPayments(generatePaymentSchedule(startDate, paymentTerms as PaymentTerm, Number(value) || 0));
  }
  useEffect(() => {
    if (payments.length === 0 && canGenerate) regenerateSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentTerms, startDate, value]);

  function updatePayment(i: number, patch: Partial<FmContractPaymentRow>) {
    setPayments((prev) => prev.map((p, idx) => {
      if (idx !== i) return p;
      const merged = { ...p, ...patch };
      if ("payment_date" in patch || "received_date" in patch) {
        merged.status = computePaymentStatus(merged.payment_date, merged.received_date);
      }
      return merged;
    }));
  }

  function handleStartDateChange(v: string) {
    setStartDate(v);
    if (v) setEndDate(addYearMinusDay(v));
  }

  async function save() {
    if (!customerName) { toast.error("Select a client"); return; }
    if (!title.trim()) { toast.error("Enter a contract / site title"); return; }
    setSaving(true);
    try {
      await saveFmContract({
        contract_no: contractNo,
        customer_id: customerId,
        customer_name: customerName,
        title,
        contract_scope_type: contractScopeType,
        site_name: siteName,
        site_address: siteAddress,
        building_type: buildingType,
        billing_cycle: billingCycle,
        retention_percent: retentionPercent,
        vat_percent: vatPercent,
        contract_manager_id: contractManagerId === "none" ? null : contractManagerId,
        sla_profile_id: slaProfileId === "none" ? null : slaProfileId,
        value,
        start_date: startDate,
        end_date: endDate,
        payment_terms: paymentTerms,
        status,
        remark,
        payments,
      }, editing?.id);

      toast.success(editing ? "FM contract updated" : "FM contract created");
      qc.invalidateQueries({ queryKey: ["fm-contracts"] });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit FM Contract" : "New FM Contract"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Contract No</Label>
              <Input placeholder="e.g. CN-2026-0001" value={contractNo} onChange={(e) => setContractNo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Client *</Label>
              <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between">
                    {customerName || "Select client..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0 pointer-events-auto" align="start">
                  <Command>
                    <CommandInput placeholder="Search customer..." />
                    <CommandList>
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup>
                        {customers.map((c: any) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.display_name} ${c.company_name ?? ""}`}
                            onSelect={() => {
                              setCustomerId(c.id);
                              setCustomerName(c.display_name);
                              setCustomerPickerOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", customerId === c.id ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col">
                              <span>{c.display_name}</span>
                              {c.company_name && <span className="text-xs text-muted-foreground">{c.company_name}</span>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Contract / Site Title *</Label>
              <Input placeholder="e.g. 48 Parkside – FM Services" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Contract Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="p-4 space-y-4">
            <div>
              <Label className="text-sm font-medium">FM Contract Details</Label>
              <p className="text-xs text-muted-foreground">Site, billing and SLA details for this facilities management contract.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Scope Type</Label>
                <Select value={contractScopeType} onValueChange={setContractScopeType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FM_SCOPE_TYPES.map((scope) => <SelectItem key={scope} value={scope}>{scope}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Site Name</Label>
                <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Building Type</Label>
                <Input value={buildingType} onChange={(e) => setBuildingType(e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label>Site Address</Label>
                <Textarea rows={2} value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Billing Cycle</Label>
                <Select value={billingCycle || undefined} onValueChange={setBillingCycle}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {BILLING_CYCLES.map((cycle) => <SelectItem key={cycle} value={cycle}>{cycle}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Retention %</Label>
                <Input type="number" min="0" step="0.01" value={retentionPercent} onChange={(e) => setRetentionPercent(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>VAT %</Label>
                <Input type="number" min="0" step="0.01" value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Contract Manager</Label>
                <Select value={contractManagerId} onValueChange={setContractManagerId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {contractManagers.map((employee: any) => {
                      const name = employee.full_name || [employee.first_name, employee.last_name].filter(Boolean).join(" ");
                      return <SelectItem key={employee.id} value={employee.id}>{name || "Unnamed employee"}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>SLA Profile</Label>
                <Select value={slaProfileId} onValueChange={setSlaProfileId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {slaProfiles.map((profile: any) => (
                      <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label>Contract Value</Label>
              <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Payment Terms</Label>
              <Select value={paymentTerms} onValueChange={(v) => setPaymentTerms(v as PaymentTerm)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Payment Schedule</Label>
              <Button type="button" variant="outline" size="sm" onClick={regenerateSchedule} disabled={!canGenerate}>
                Regenerate
              </Button>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Received Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground text-sm">
                      Select payment terms and start date to generate the schedule.
                    </TableCell></TableRow>
                  ) : payments.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        <Input type="date" value={p.payment_date} onChange={(e) => updatePayment(i, { payment_date: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="0.01" value={p.value} onChange={(e) => updatePayment(i, { value: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Select value={p.status} onValueChange={(v) => updatePayment(i, { status: v })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PAY_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input type="date" value={p.received_date} onChange={(e) => updatePayment(i, { received_date: e.target.value })} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>

          <div className="space-y-1">
            <Label>Remark</Label>
            <Textarea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : editing ? "Update Contract" : "Create Contract"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
