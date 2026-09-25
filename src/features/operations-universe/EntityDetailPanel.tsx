import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CenterDetailField } from "./types";

interface EntityDetailPanelProps {
  title: string;
  fields: CenterDetailField[] | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EntityDetailPanel({ title, fields, open, onOpenChange }: EntityDetailPanelProps) {
  const isMobile = useIsMobile();

  if (!fields || fields.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={isMobile ? "max-h-[70vh]" : ""}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Details for the selected item.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {fields.map((field) => (
            <div key={field.label} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{field.label}</span>
              <span className="font-medium text-right">{field.value}</span>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
