import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalendarView = "month" | "week";

export type CalendarEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  subtitle?: string;
  colorClass: string; // tailwind classes for the chip background/text
};

type SchedulingCalendarProps = {
  view: CalendarView;
  referenceDate: Date;
  events: CalendarEvent[];
  onReferenceDateChange: (date: Date) => void;
  onDayClick: (isoDate: string) => void;
  onEventClick: (event: CalendarEvent) => void;
};

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - result.getDay());
  result.setHours(0, 0, 0, 0);
  return result;
}

function buildMonthGrid(referenceDate: Date): Date[] {
  const firstOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    return day;
  });
}

function buildWeekGrid(referenceDate: Date): Date[] {
  const gridStart = startOfWeek(referenceDate);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    return day;
  });
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SchedulingCalendar({
  view,
  referenceDate,
  events,
  onReferenceDateChange,
  onDayClick,
  onEventClick,
}: SchedulingCalendarProps) {
  const days = useMemo(
    () => (view === "month" ? buildMonthGrid(referenceDate) : buildWeekGrid(referenceDate)),
    [view, referenceDate],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  }, [events]);

  const todayIso = toIsoDate(new Date());
  const currentMonth = referenceDate.getMonth();

  function step(amount: number) {
    const next = new Date(referenceDate);
    if (view === "month") next.setMonth(next.getMonth() + amount);
    else next.setDate(next.getDate() + amount * 7);
    onReferenceDateChange(next);
  }

  const label =
    view === "month"
      ? referenceDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{label}</h3>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" onClick={() => step(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => onReferenceDateChange(new Date())}>
            Today
          </Button>
          <Button size="icon" variant="outline" onClick={() => step(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border">
        {WEEKDAY_LABELS.map((weekday) => (
          <div
            key={weekday}
            className="bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground text-center"
          >
            {weekday}
          </div>
        ))}
        {days.map((day) => {
          const iso = toIsoDate(day);
          const dayEvents = eventsByDate.get(iso) ?? [];
          const isOtherMonth = view === "month" && day.getMonth() !== currentMonth;
          const isToday = iso === todayIso;
          const visibleEvents = view === "month" ? dayEvents.slice(0, 3) : dayEvents;
          const overflow = dayEvents.length - visibleEvents.length;

          return (
            <div
              key={iso}
              onClick={() => onDayClick(iso)}
              className={cn(
                "bg-background p-1.5 flex flex-col gap-1 min-h-24 hover:bg-muted/50 transition-colors cursor-pointer",
                view === "week" && "min-h-40",
                isOtherMonth && "opacity-40",
              )}
            >
              <span
                className={cn(
                  "text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full",
                  isToday && "bg-primary text-primary-foreground",
                )}
              >
                {day.getDate()}
              </span>
              <div className="space-y-0.5">
                {visibleEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                    title={event.subtitle ? `${event.title} — ${event.subtitle}` : event.title}
                    className={cn(
                      "block w-full text-left text-[10px] leading-tight rounded px-1 py-0.5 truncate cursor-pointer",
                      event.colorClass,
                    )}
                  >
                    {event.title}
                  </button>
                ))}
                {overflow > 0 && (
                  <div className="text-[10px] text-muted-foreground px-1">+{overflow} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
