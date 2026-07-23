import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE = 50;

export function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

type Props = {
  page: number;
  pageSize?: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function PaginationBar({ page, pageSize = PAGE_SIZE, total, onPageChange, className }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  if (total <= pageSize) {
    return (
      <div className={`flex items-center justify-end px-3 py-2 text-xs text-muted-foreground ${className ?? ""}`}>
        {total === 0 ? "0 records" : `${total} record${total === 1 ? "" : "s"}`}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-2 border-t ${className ?? ""}`}>
      <div className="text-xs text-muted-foreground">
        Showing {start}–{end} of {total}
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={safePage === 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <div className="text-xs px-2">
          Page <span className="font-medium">{safePage}</span> of {totalPages}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={safePage === totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
