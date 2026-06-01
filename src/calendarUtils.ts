import { projectTasksForDate, Task, TaskOccurrence } from './taskStore';

export const weekdayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type CalendarDay = {
  date: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  marker?: 'holiday' | 'anniversary';
  markerLabel?: string;
  tasks: TaskOccurrence[];
};

export type CalendarMonth = {
  year: number;
  monthIndex: number;
  title: string;
  days: CalendarDay[];
};

const localMarkers: Record<string, CalendarDay['markerLabel']> = {
  '01-01': 'New Year',
  '02-14': 'Anniversary',
  '12-25': 'Holiday',
};

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function getMonthTitle(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(year, monthIndex, 1));
}

export function getCalendarMonthDays(
  year: number,
  monthIndex: number,
  tasks: Task[] = [],
  today = formatDateKey(new Date()),
): CalendarMonth {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const start = new Date(year, monthIndex, 1 - firstOfMonth.getDay());
  const totalCells = 42;

  const days = Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const key = formatDateKey(date);
    const markerKey = key.slice(5);
    const markerLabel = localMarkers[markerKey];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isCurrentMonth = date.getMonth() === monthIndex;

    return {
      date: key,
      dayNumber: date.getDate(),
      isCurrentMonth,
      isToday: key === today,
      isWeekend,
      marker: markerLabel === 'Anniversary' ? ('anniversary' as const) : markerLabel ? ('holiday' as const) : undefined,
      markerLabel,
      tasks: projectTasksForDate(tasks, key),
    };
  });

  return {
    year,
    monthIndex,
    title: getMonthTitle(year, monthIndex),
    days,
  };
}

export function getVisibleTaskPills(tasks: TaskOccurrence[], limit = 2) {
  return {
    visible: tasks.slice(0, limit),
    overflowCount: Math.max(0, tasks.length - limit),
  };
}
