import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoAsset from "@/assets/fizfix-logo.jpeg.asset.json";

type WorkItem = { problem: string; work: string; parts: string; hours: string; status: string };

export type ReportPdfMeta = { allottedHours?: number; usedHoursOther?: number };

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(logoAsset.url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildServiceReportPdf(
  form: any,
  items: WorkItem[],
  meta: ReportPdfMeta = {},
): Promise<{ doc: jsPDF; fileName: string }> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 40;
  let y = 40;

  const logo = await loadLogo();
  if (logo) {
    try {
      doc.addImage(logo, "JPEG", marginX, y, 54, 54);
    } catch {
      // logo failed to embed; continue without it
    }
  }

  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.text("FIZ FIX Technical Services", marginX + (logo ? 66 : 0), y + 22);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Work Completion Report", marginX + (logo ? 66 : 0), y + 38);

  doc.setFontSize(10);
  doc.text(`Report No: ${form.report_no || "—"}`, 555, y + 22, { align: "right" });
  doc.text(`Date: ${form.service_date || "—"}`, 555, y + 38, { align: "right" });

  y += 66;
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(1);
  doc.line(marginX, y, 555, y);
  y += 18;

  const visitRows: [string, string][] = [
    ["Customer", form.customer_name || "—"],
    ["Report No", form.report_no || "—"],
    ["Service Date", form.service_date || "—"],
    ["Technician", form.technician_name || "—"],
    ["Time Checked In", form.time_checked_in || "—"],
    ["Time Checked Out", form.time_checked_out || "—"],
    ["Service Type", form.service_type || "—"],
    ["Location / Unit", form.location || "—"],
    ["Status", form.status || "—"],
  ];

  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 } },
    body: visitRows,
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 16;


  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Work Carried Out", marginX, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["#", "Problem Reported", "Work Done", "Parts Used", "Hours", "Status"]],
    body: items.map((it, i) => [
      String(i + 1),
      it.problem || "—",
      it.work || "—",
      it.parts || "—",
      it.hours || "—",
      it.status || "—",
    ]),
    styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [51, 65, 85] },
    columnStyles: { 0: { cellWidth: 20 } },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  const totalHours = items.reduce((s, it) => s + (Number(it.hours) || 0), 0);
  const thisVisitHours = form.handyman_hours === "" || form.handyman_hours == null ? 0 : Number(form.handyman_hours) || 0;
  const allotted = Number(meta.allottedHours ?? 0);
  const usedOther = Number(meta.usedHoursOther ?? 0);
  const balanceHours = allotted - usedOther - thisVisitHours;
  const summaryRows: [string, string][] = [
    ["Total Hours", String(totalHours || 0)],
    ["Handyman Hours (contract allowance)", `${allotted} h`],
    ["Handyman Hours (previously used)", `${usedOther} h`],
    ["Handyman Hours Used (this visit)", `${thisVisitHours} h`],
    ["Balance Handyman Hours", `${balanceHours} h`],
    ["Material Used - Supplied By", form.material_supplied_by || "—"],
    ["Amount Received", form.amount_received ? String(form.amount_received) : "—"],
    ["Balance Amount", form.balance_amount ? String(form.balance_amount) : "—"],
  ];


  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 180 } },
    body: summaryRows,
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  if (form.recommendations || form.next_service_date) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Recommendations & Next Visit", marginX, y);
    y += 16;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (form.recommendations) {
      const lines = doc.splitTextToSize(form.recommendations, 515);
      doc.text(lines, marginX, y);
      y += lines.length * 12 + 8;
    }
    if (form.next_service_date) {
      doc.text(`Next Service Due: ${form.next_service_date}`, marginX, y);
      y += 20;
    }
  }

  if (form.google_rating || form.google_review) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Customer Feedback", marginX, y);
    y += 16;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (form.google_rating) {
      doc.text(`Rating: ${form.google_rating}/5`, marginX, y);
      y += 14;
    }
    if (form.google_review) {
      const lines = doc.splitTextToSize(form.google_review, 515);
      doc.text(lines, marginX, y);
      y += lines.length * 12 + 8;
    }
  }

  if (y > 700) {
    doc.addPage();
    y = 48;
  }

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Sign-off", marginX, y);
  y += 16;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Signed by: ${form.signed_by || "—"}`, marginX, y);
  y += 12;

  if (form.signature_data) {
    try {
      doc.addImage(form.signature_data, "PNG", marginX, y, 160, 60);
    } catch {
      // signature image failed to embed; skip silently
    }
  }

  const fileName = `${(form.report_no || "work-completion-report").replace(/[^\w-]+/g, "_")}.pdf`;
  return { doc, fileName };
}
