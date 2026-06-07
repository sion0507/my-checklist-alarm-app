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

type KoreanHoliday = {
  date: string;
  label: string;
};

const localMarkers: Record<string, { marker: CalendarDay['marker']; label: CalendarDay['markerLabel'] }> = {
  '02-14': { marker: 'anniversary', label: 'Anniversary' },
};

const fixedKoreanHolidays: Record<string, CalendarDay['markerLabel']> = {
  '01-01': '신정',
  '03-01': '삼일절',
  '05-05': '어린이날',
  '06-06': '현충일',
  '08-15': '광복절',
  '10-03': '개천절',
  '10-09': '한글날',
  '12-25': '기독탄신일',
};

const lunarKoreanHolidaysByYear: Record<number, KoreanHoliday[]> = {
  2026: [
    { date: '2026-02-16', label: '설날 전날' },
    { date: '2026-02-17', label: '설날' },
    { date: '2026-02-18', label: '설날 다음날' },
    { date: '2026-05-24', label: '부처님오신날' },
    { date: '2026-09-24', label: '추석 전날' },
    { date: '2026-09-25', label: '추석' },
    { date: '2026-09-26', label: '추석 다음날' },
  ],
  2027: [
    { date: '2027-02-06', label: '설날 전날' },
    { date: '2027-02-07', label: '설날' },
    { date: '2027-02-08', label: '설날 다음날' },
    { date: '2027-05-13', label: '부처님오신날' },
    { date: '2027-09-14', label: '추석 전날' },
    { date: '2027-09-15', label: '추석' },
    { date: '2027-09-16', label: '추석 다음날' },
  ],
  2028: [
    { date: '2028-01-26', label: '설날 전날' },
    { date: '2028-01-27', label: '설날' },
    { date: '2028-01-28', label: '설날 다음날' },
    { date: '2028-05-02', label: '부처님오신날' },
    { date: '2028-10-02', label: '추석 전날' },
    { date: '2028-10-03', label: '추석' },
    { date: '2028-10-04', label: '추석 다음날' },
  ],
  2029: [
    { date: '2029-02-12', label: '설날 전날' },
    { date: '2029-02-13', label: '설날' },
    { date: '2029-02-14', label: '설날 다음날' },
    { date: '2029-05-20', label: '부처님오신날' },
    { date: '2029-09-21', label: '추석 전날' },
    { date: '2029-09-22', label: '추석' },
    { date: '2029-09-23', label: '추석 다음날' },
  ],
  2030: [
    { date: '2030-02-02', label: '설날 전날' },
    { date: '2030-02-03', label: '설날' },
    { date: '2030-02-04', label: '설날 다음날' },
    { date: '2030-05-09', label: '부처님오신날' },
    { date: '2030-09-11', label: '추석 전날' },
    { date: '2030-09-12', label: '추석' },
    { date: '2030-09-13', label: '추석 다음날' },
  ],
  2031: [
    { date: '2031-01-22', label: '설날 전날' },
    { date: '2031-01-23', label: '설날' },
    { date: '2031-01-24', label: '설날 다음날' },
    { date: '2031-05-28', label: '부처님오신날' },
    { date: '2031-09-30', label: '추석 전날' },
    { date: '2031-10-01', label: '추석' },
    { date: '2031-10-02', label: '추석 다음날' },
  ],
  2032: [
    { date: '2032-02-10', label: '설날 전날' },
    { date: '2032-02-11', label: '설날' },
    { date: '2032-02-12', label: '설날 다음날' },
    { date: '2032-05-16', label: '부처님오신날' },
    { date: '2032-09-18', label: '추석 전날' },
    { date: '2032-09-19', label: '추석' },
    { date: '2032-09-20', label: '추석 다음날' },
  ],
};

const specialKoreanHolidays: Record<string, CalendarDay['markerLabel']> = {
  '2026-03-02': '삼일절 대체공휴일',
  '2026-05-25': '부처님오신날 대체공휴일',
  '2026-06-03': '지방선거일',
  '2026-08-17': '광복절 대체공휴일',
  '2026-10-05': '개천절 대체공휴일',
  '2027-02-09': '설날 대체공휴일',
  '2027-08-16': '광복절 대체공휴일',
  '2027-10-04': '개천절 대체공휴일',
  '2027-10-11': '한글날 대체공휴일',
  '2027-12-27': '기독탄신일 대체공휴일',
  '2028-04-12': '국회의원 선거일',
  '2028-10-05': '추석 대체공휴일',
  '2029-05-07': '어린이날 대체공휴일',
  '2029-05-21': '부처님오신날 대체공휴일',
  '2029-09-24': '추석 대체공휴일',
  '2030-02-05': '설날 대체공휴일',
  '2030-04-03': '대통령 선거일',
  '2030-05-06': '어린이날 대체공휴일',
  '2030-06-12': '지방선거일',
  '2031-03-03': '삼일절 대체공휴일',
  '2032-05-17': '부처님오신날 대체공휴일',
  '2032-08-16': '광복절 대체공휴일',
  '2032-09-21': '추석 대체공휴일',
  '2032-10-04': '개천절 대체공휴일',
  '2032-10-11': '한글날 대체공휴일',
  '2032-12-27': '기독탄신일 대체공휴일',
};

function getKoreanHolidayLabel(dateKey: string) {
  const fixedLabel = fixedKoreanHolidays[dateKey.slice(5)];
  const lunarLabel = lunarKoreanHolidaysByYear[Number(dateKey.slice(0, 4))]?.find((holiday) => holiday.date === dateKey)?.label;
  const specialLabel = specialKoreanHolidays[dateKey];

  return [fixedLabel, lunarLabel, specialLabel].filter(Boolean).join(' · ') || undefined;
}

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
    const localMarker = localMarkers[markerKey];
    const koreanHolidayLabel = getKoreanHolidayLabel(key);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isCurrentMonth = date.getMonth() === monthIndex;
    const marker = koreanHolidayLabel ? 'holiday' : localMarker?.marker;
    const markerLabel = [koreanHolidayLabel, localMarker?.label].filter(Boolean).join(' · ') || undefined;

    return {
      date: key,
      dayNumber: date.getDate(),
      isCurrentMonth,
      isToday: key === today,
      isWeekend,
      marker,
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
