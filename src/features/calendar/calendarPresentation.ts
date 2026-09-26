import { Cake, CalendarDays, CalendarCheck, Flower, Gift } from "lucide-react";
import type { CalendarEventKind } from "./calendarModel";

export const calendarEventMeta: Record<CalendarEventKind, { label: string; icon: typeof CalendarDays }> = {
  birthday: { label: "생일", icon: Cake },
  anniversary: { label: "기념일", icon: Gift },
  memorial: { label: "기일", icon: Flower },
  appointment: { label: "약속", icon: CalendarCheck },
};
