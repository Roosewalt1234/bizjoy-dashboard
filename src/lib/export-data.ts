import * as XLSX from "xlsx";

export type ExportColumn = {
  key: string;
  label: string;
  format?: (value: any, row: any) => any;
};

function buildRows(rows: any[], columns: ExportColumn[]) {
  return rows.map((r) => {
    const o: Record<string, any> = {};
    columns.forEach((c) => {
      const raw = r?.[c.key];
      const v = c.format ? c.format(raw, r) : raw;
      o[c.label] = v ?? "";
    });
    return o;
  });
}

export function exportToCSV(filename: string, rows: any[], columns: ExportColumn[]) {
  const data = buildRows(rows, columns);
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${filename}.csv`);
}

export function exportToXLSX(filename: string, rows: any[], columns: ExportColumn[], sheetName = "Sheet1") {
  const data = buildRows(rows, columns);
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Sheet1");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
