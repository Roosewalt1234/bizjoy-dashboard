/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRow = Record<string, any>;

export const INVOICE_PACK_STATUSES = [
  "Draft",
  "Prepared",
  "Submitted",
  "Client Review",
  "Approved",
  "Rejected",
  "Invoiced",
  "Paid",
  "Cancelled",
] as const;

export const INVOICE_ITEM_TYPES = [
  "Contract Service",
  "Additional Work",
  "Spare Parts",
  "Material",
  "Deduction",
  "Penalty",
  "Retention",
  "Credit Note",
  "Variation",
  "Other",
] as const;

export const PARKSIDE_TEMPLATE_LINES = [
  { description: "Cleaning", amount: 24550 },
  { description: "MEP & HVAC", amount: 57667 },
  { description: "Swimming Pool", amount: 6000 },
  { description: "Lift Maintenance", amount: 2880 },
] as const;

export function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function getBillingMonthRange(month = new Date().toISOString().slice(0, 7)) {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(year, monthIndex - 1, 1);
  const end = new Date(year, monthIndex, 0);
  return { start: toIsoDate(start), end: toIsoDate(end), month };
}

export function money(value: unknown) {
  return Number(value) || 0;
}

export function calculateInvoiceSubtotal(items: AnyRow[]) {
  return items
    .filter((item) => item.item_type === "Contract Service")
    .reduce((sum, item) => sum + money(item.amount), 0);
}

export function calculateInvoiceDeductions(items: AnyRow[]) {
  return items
    .filter((item) => ["Deduction", "Penalty", "Credit Note"].includes(item.item_type))
    .reduce((sum, item) => sum + Math.abs(money(item.amount)), 0);
}

export function calculateInvoiceAdjustments(items: AnyRow[]) {
  return items
    .filter((item) =>
      ["Additional Work", "Spare Parts", "Material", "Variation", "Other"].includes(item.item_type),
    )
    .reduce((sum, item) => sum + money(item.amount), 0);
}

export function calculateVatAmount(subtotal: number, vatPercent: number) {
  return roundMoney((subtotal * money(vatPercent)) / 100);
}

export function calculateRetentionAmount(subtotal: number, retentionPercent: number) {
  return roundMoney((subtotal * money(retentionPercent)) / 100);
}

export function calculateGrossAmount(subtotal: number, vatAmount: number) {
  return roundMoney(subtotal + vatAmount);
}

export function calculateNetPayable(
  grossAmount: number,
  retentionAmount: number,
  deductionAmount: number,
  adjustmentAmount: number,
) {
  return roundMoney(grossAmount - retentionAmount - deductionAmount + adjustmentAmount);
}

export function calculateInvoiceTotals(items: AnyRow[], vatPercent = 5, retentionPercent = 0) {
  const subtotal = calculateInvoiceSubtotal(items);
  const deductionAmount = calculateInvoiceDeductions(items);
  const adjustmentAmount = calculateInvoiceAdjustments(items);
  const vatAmount = calculateVatAmount(subtotal, vatPercent);
  const retentionAmount = calculateRetentionAmount(subtotal, retentionPercent);
  const grossAmount = calculateGrossAmount(subtotal, vatAmount);
  const netPayable = calculateNetPayable(
    grossAmount,
    retentionAmount,
    deductionAmount,
    adjustmentAmount,
  );
  return {
    subtotal,
    vatAmount,
    retentionAmount,
    deductionAmount,
    adjustmentAmount,
    grossAmount,
    netPayable,
  };
}

export function buildInvoiceItemsFromContractLineItems(lineItems: AnyRow[]) {
  return lineItems
    .filter((item) => item.active !== false)
    .map((item, index) => {
      const amount =
        money(item.monthly_amount) || money(item.unit_rate) * (money(item.quantity) || 1);
      return {
        contract_line_item_id: item.id,
        service_category_id: item.service_category_id,
        item_type: "Contract Service",
        description: item.description || "Contract service",
        quantity: money(item.quantity) || 1,
        unit: item.uom || "month",
        unit_rate: money(item.unit_rate) || amount,
        amount: roundMoney(amount),
        vat_applicable: true,
        sort_order: index + 1,
      };
    });
}

export function buildParksideInvoiceItems(existingItems: AnyRow[] = []) {
  const existing = new Set(
    existingItems.map((item) =>
      String(item.description || "")
        .trim()
        .toLowerCase(),
    ),
  );
  return PARKSIDE_TEMPLATE_LINES.filter(
    (line) => !existing.has(line.description.toLowerCase()),
  ).map((line, index) => ({
    item_type: "Contract Service",
    description: line.description,
    quantity: 1,
    unit: "month",
    unit_rate: line.amount,
    amount: line.amount,
    vat_applicable: true,
    sort_order: existingItems.length + index + 1,
    remarks: "48 Parkside helper template",
  }));
}

export function buildClientSubmissionSummary(input: {
  monthlyReport?: AnyRow | null;
  workOrders: AnyRow[];
  ppmVisits: AnyRow[];
  attendanceLogs: AnyRow[];
  manpowerPlans: AnyRow[];
  manpowerAssignments: AnyRow[];
  serviceReports: AnyRow[];
  invoiceItems: AnyRow[];
  start: string;
  end: string;
}) {
  const inRange = (value: string | null | undefined) => {
    if (!value) return false;
    const date = value.slice(0, 10);
    return date >= input.start && date <= input.end;
  };
  const workOrders = input.workOrders.filter((row) =>
    inRange(row.reported_at ?? row.scheduled_date ?? row.requested_date ?? row.created_at),
  );
  const ppmVisits = input.ppmVisits.filter((row) => inRange(row.planned_date ?? row.due_date));
  const attendance = input.attendanceLogs.filter((row) => inRange(row.attendance_date));
  const serviceReports = input.serviceReports.filter((row) =>
    inRange(row.service_date ?? row.created_at),
  );
  const requiredManpower = input.manpowerPlans.reduce(
    (sum, plan) => sum + (money(plan.required_headcount) || 0),
    0,
  );
  const assignedManpower = input.manpowerAssignments.filter(
    (row) => row.status !== "Inactive" && row.status !== "Ended",
  ).length;
  const completedPpm = ppmVisits.filter((row) => row.status === "Completed").length;
  const completedWorkOrders = workOrders.filter((row) =>
    ["Completed", "Closed"].includes(row.status),
  ).length;
  const split = ["Emergency", "Reactive", "Corrective", "PPM", "Inspection", "Other"].reduce<
    Record<string, number>
  >((acc, type) => {
    acc[type] = workOrders.filter((row) => row.request_type === type).length;
    return acc;
  }, {});
  return {
    monthlyReport: {
      id: input.monthlyReport?.id ?? null,
      status: input.monthlyReport?.status ?? "Not generated",
      slaCompliance:
        input.monthlyReport?.report_data?.sla?.compliancePercent ??
        input.monthlyReport?.sla_compliance_percent ??
        0,
      ppmCompletion:
        input.monthlyReport?.report_data?.ppm?.completionPercent ??
        input.monthlyReport?.ppm_compliance_percent ??
        0,
      manpowerShortage:
        input.monthlyReport?.report_data?.manpower?.shortageCount ??
        input.monthlyReport?.manpower_variance ??
        0,
    },
    workOrders: {
      total: workOrders.length,
      completed: completedWorkOrders,
      pending: workOrders.length - completedWorkOrders,
      split,
      breachedSla: workOrders.filter(
        (row) => row.response_sla_status === "Breached" || row.completion_sla_status === "Breached",
      ).length,
    },
    ppm: {
      planned: ppmVisits.length,
      completed: completedPpm,
      overdue: ppmVisits.filter(
        (row) =>
          row.status !== "Completed" && (row.due_date ?? row.planned_date) < toIsoDate(new Date()),
      ).length,
      completionPercent: ppmVisits.length ? Math.round((completedPpm / ppmVisits.length) * 100) : 0,
    },
    manpower: {
      required: requiredManpower,
      assigned: assignedManpower,
      present: attendance.filter((row) => row.status === "Present").length,
      absent: attendance.filter((row) => row.status === "Absent").length,
      late: attendance.filter((row) => row.status === "Late").length,
      shortage: Math.max(0, requiredManpower - assignedManpower),
    },
    serviceReports: {
      completed: serviceReports.filter((row) => row.status === "Completed").length,
      followUpRequired: serviceReports.filter((row) => row.follow_up_required).length,
      defectsFound: serviceReports.filter((row) => Boolean(row.defects_found)).length,
    },
    deductionsAdjustments: {
      deductions: input.invoiceItems.filter((row) => row.item_type === "Deduction").length,
      penalties: input.invoiceItems.filter((row) => row.item_type === "Penalty").length,
      credits: input.invoiceItems.filter((row) => row.item_type === "Credit Note").length,
      adjustments: input.invoiceItems.filter((row) =>
        ["Additional Work", "Spare Parts", "Material", "Variation", "Other"].includes(
          row.item_type,
        ),
      ).length,
    },
    clientNotes: {
      pendingApprovals: "",
      pendingSpareParts: "",
      exclusions: "",
      clientSupportRequired: "",
      remarks: "",
    },
  };
}

export function getInvoiceStatusBadgeVariant(status: string | null | undefined) {
  if (["Approved", "Invoiced", "Paid"].includes(status ?? "")) return "default";
  if (["Rejected", "Cancelled"].includes(status ?? "")) return "destructive";
  return "outline";
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function getBillableBillingLines(lines: AnyRow[]) {
  return lines.filter((line) => line.is_total_row !== true);
}

export function summarizeBillingLines(lines: AnyRow[], vatPercent = 5) {
  const billable = getBillableBillingLines(lines);
  const subtotal = roundMoney(
    billable.reduce((sum, line) => sum + money(line.monthly_amount), 0),
  );
  const annualSubtotal = roundMoney(
    billable.reduce((sum, line) => sum + money(line.annual_amount), 0),
  );
  const vatAmount = calculateVatAmount(subtotal, vatPercent);
  const grossAmount = calculateGrossAmount(subtotal, vatAmount);
  return { billableCount: billable.length, subtotal, annualSubtotal, vatAmount, grossAmount };
}

export function buildInvoiceItemsFromBillingLines(lines: AnyRow[]) {
  return getBillableBillingLines(lines).map((line, index) => ({
    service_category_id: line.service_category_id ?? null,
    item_type: "Contract Service",
    description: line.billing_line || "Contract service",
    quantity: 1,
    unit: "month",
    unit_rate: roundMoney(money(line.monthly_amount)),
    amount: roundMoney(money(line.monthly_amount)),
    vat_applicable: String(line.vat_status ?? "").toLowerCase() !== "exempt",
    sort_order: index + 1,
    remarks: "Generated from billing template",
  }));
}
