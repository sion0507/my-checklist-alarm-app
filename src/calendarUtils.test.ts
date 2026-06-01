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
