import { describe, expect, it } from 'vitest';
import { getCalendarMonthDays, getVisibleTaskPills } from './calendarUtils';
import { Task } from './taskStore';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? 'task',
    title: overrides.title ?? 'Task',
    date: overrides.date ?? '2026-06-01',
    time: overrides.time ?? '',
    recurrence: overrides.recurrence ?? 'none',
    memo: overrides.memo ?? '',
    notify: overrides.notify ?? false,
    completed: overrides.completed ?? false,
    createdAt: overrides.createdAt ?? '2026-06-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-01T00:00:00.000Z',
    exceptions: overrides.exceptions,
  };
}

describe('calendar month projection', () => {
  it('projects a fixed six-week Sunday-to-Saturday grid with adjacent-month filler dates', () => {
    const month = getCalendarMonthDays(2026, 5, [], '2026-06-15');

    expect(month.title).toBe('June 2026');
    expect(month.days).toHaveLength(42);
    expect(month.days[0]).toMatchObject({ date: '2026-05-31', dayNumber: 31, isCurrentMonth: false, isWeekend: true });
    expect(month.days[1]).toMatchObject({ date: '2026-06-01', dayNumber: 1, isCurrentMonth: true, isWeekend: false });
    expect(month.days[15]).toMatchObject({ date: '2026-06-15', isToday: true });
    expect(month.days[41]).toMatchObject({ date: '2026-07-11', dayNumber: 11, isCurrentMonth: false, isWeekend: true });
  });

  it('projects dated and recurring task occurrences into matching date cells', () => {
    const dated = makeTask({ id: 'dated', title: 'Doctor', date: '2026-06-10', time: '09:30' });
    const weekly = makeTask({ id: 'weekly', title: 'Review', date: '2026-06-03', recurrence: 'weekly' });
    const month = getCalendarMonthDays(2026, 5, [dated, weekly], '2026-06-01');

    expect(month.days.find((day) => day.date === '2026-06-10')?.tasks.map((task) => task.id)).toEqual(['dated', 'weekly']);
    expect(month.days.find((day) => day.date === '2026-06-17')?.tasks.map((task) => task.id)).toEqual(['weekly']);
  });

  it('marks Korean public holidays, substitutes, lunar holidays, and election days with Korean labels', () => {
    const february = getCalendarMonthDays(2026, 1, [], '2026-02-01');
    expect(february.days.find((day) => day.date === '2026-02-16')).toMatchObject({ marker: 'holiday', markerLabel: '설날 전날' });
    expect(february.days.find((day) => day.date === '2026-02-17')).toMatchObject({ marker: 'holiday', markerLabel: '설날' });
    expect(february.days.find((day) => day.date === '2026-02-18')).toMatchObject({ marker: 'holiday', markerLabel: '설날 다음날' });

    const march = getCalendarMonthDays(2026, 2, [], '2026-03-01');
    expect(march.days.find((day) => day.date === '2026-03-01')).toMatchObject({ marker: 'holiday', markerLabel: '삼일절' });
    expect(march.days.find((day) => day.date === '2026-03-02')).toMatchObject({ marker: 'holiday', markerLabel: '삼일절 대체공휴일' });

    const june = getCalendarMonthDays(2026, 5, [], '2026-06-01');
    expect(june.days.find((day) => day.date === '2026-06-03')).toMatchObject({ marker: 'holiday', markerLabel: '지방선거일' });
    expect(june.days.find((day) => day.date === '2026-06-04')?.marker).toBeUndefined();
  });

  it('marks supported-year election holidays from the centralized Korean holiday table', () => {
    const electionHolidays = [
      { date: '2026-06-03', label: '지방선거일' },
      { date: '2028-04-12', label: '국회의원 선거일' },
      { date: '2030-04-03', label: '대통령 선거일' },
      { date: '2030-06-12', label: '지방선거일' },
      { date: '2032-04-14', label: '국회의원 선거일' },
    ];

    for (const { date, label } of electionHolidays) {
      const [year, month] = date.split('-').map(Number);
      const monthProjection = getCalendarMonthDays(year, month - 1, [], `${date.slice(0, 8)}01`);

      expect(monthProjection.days.find((day) => day.date === date)).toMatchObject({ marker: 'holiday', markerLabel: label });
    }
  });

  it('keeps unsupported future-year fillers unmarked when the UI is capped to the holiday table range', () => {
    const december = getCalendarMonthDays(2032, 11, [], '2032-12-01');

    expect(december.days.find((day) => day.date === '2033-01-01')).toMatchObject({ marker: undefined, markerLabel: undefined });
  });

  it('keeps personal anniversary marker distinct from Korean public holidays', () => {
    const february = getCalendarMonthDays(2026, 1, [], '2026-02-01');

    expect(february.days.find((day) => day.date === '2026-02-14')).toMatchObject({ marker: 'anniversary', markerLabel: 'Anniversary' });
  });

  it('limits visible task pills and reports overflow count', () => {
    const tasks = [
      makeTask({ id: 'one' }),
      makeTask({ id: 'two' }),
      makeTask({ id: 'three' }),
      makeTask({ id: 'four' }),
    ].map((task) => ({ ...task, occurrenceDate: task.date, sourceDate: task.date, isRecurringOccurrence: false }));

    expect(getVisibleTaskPills(tasks, 2)).toEqual({ visible: [tasks[0], tasks[1]], overflowCount: 2 });
  });
});
