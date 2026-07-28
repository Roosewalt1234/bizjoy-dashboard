import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportToCSV, exportToXLSX, type ExportColumn } from "@/lib/export-data";

type Props = {
  filename: string;
  rows: any[];
  columns: ExportColumn[];
  sheetName?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
  label?: string;
};

export function ExportMenu({ filename, rows, columns, sheetName, size = "sm", variant = "outline", label = "Export" }: Props) {
  const disabled = !rows || rows.length === 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant} disabled={disabled}>
          <Download className="h-4 w-4 mr-2" /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportToXLSX(filename, rows, columns, sheetName)}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Download Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportToCSV(filename, rows, columns)}>
          <FileText className="h-4 w-4 mr-2" /> Download CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
