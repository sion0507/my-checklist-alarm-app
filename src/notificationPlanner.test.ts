import { describe, expect, it } from 'vitest';
import { buildSevenDayNotificationSchedule, type ReminderScheduleSettings } from './notificationPlanner';
import type { Task } from './taskStore';

const settings: ReminderScheduleSettings = {
  morningTime: '08:00',
  eveningTime: '23:00',
};

function task(overrides: Partial<Task>): Task {
  return {
    id: 'task-1',
    title: '알림 할 일',
    date: '2026-06-01',
    time: '09:30',
    recurrence: 'none',
    memo: 'local-only memo must not be in jobs',
    notify: true,
    completed: false,
    createdAt: '2026-05-31T00:00:00.000Z',
    updatedAt: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

describe('seven-day notification schedule planner', () => {
  it('derives morning, evening, and time-specific jobs inside the next seven days only', () => {
    const jobs = buildSevenDayNotificationSchedule({
      tasks: [task({ id: 'inside', date: '2026-06-03' }), task({ id: 'outside', date: '2026-06-08' })],
      settings,
      startDate: '2026-06-01',
    });

    expect(jobs.filter((job) => job.kind === 'morning')).toHaveLength(7);
    expect(jobs.filter((job) => job.kind === 'evening')).toHaveLength(7);
    expect(jobs.map((job) => job.scheduledFor)).toContain('2026-06-01T08:00:00');
    expect(jobs.map((job) => job.scheduledFor)).toContain('2026-06-07T23:00:00');
    expect(jobs).toContainEqual(
      expect.objectContaining({
        jobId: 'task:inside:2026-06-03',
        kind: 'task',
        scheduledFor: '2026-06-03T09:30:00',
        metadata: {
          taskId: 'inside',
          occurrenceDate: '2026-06-03',
          title: '알림 할 일',
          path: '/?date=2026-06-03&taskId=inside&occurrenceDate=2026-06-03&entry=notification',
        },
      }),
    );
    expect(jobs.map((job) => job.jobId)).not.toContain('task:outside:2026-06-08');
    expect(JSON.stringify(jobs)).not.toContain('local-only memo');
  });

  it('uses configurable morning reminder time with 08:00 as the documented default setting', () => {
    const defaultJobs = buildSevenDayNotificationSchedule({ tasks: [], settings, startDate: '2026-06-01' });
    const customJobs = buildSevenDayNotificationSchedule({
      tasks: [],
      settings: { ...settings, morningTime: '07:15' },
      startDate: '2026-06-01',
    });

    expect(defaultJobs.find((job) => job.jobId === 'morning:2026-06-01')).toMatchObject({ scheduledFor: '2026-06-01T08:00:00' });
    expect(customJobs.find((job) => job.jobId === 'morning:2026-06-01')).toMatchObject({ scheduledFor: '2026-06-01T07:15:00' });
  });

  it('derives recurrence occurrences and respects completed, deleted, moved, and notify-off state', () => {
    const jobs = buildSevenDayNotificationSchedule({
      tasks: [
        task({ id: 'daily', date: '2026-06-01', recurrence: 'daily', exceptions: { '2026-06-02': { completed: true }, '2026-06-03': { deleted: true }, '2026-06-04': { movedTo: '2026-06-06' } } }),
        task({ id: 'weekly-off', date: '2026-06-01', recurrence: 'weekly', notify: false }),
        task({ id: 'completed-once', date: '2026-06-05', completed: true }),
      ],
      settings,
      startDate: '2026-06-01',
    }).filter((job) => job.kind === 'task');

    expect(jobs.map((job) => job.jobId)).toEqual([
      'task:daily:2026-06-01',
      'task:daily:2026-06-05',
      'task:daily:2026-06-04',
      'task:daily:2026-06-06',
      'task:daily:2026-06-07',
    ]);
    expect(jobs.find((job) => job.jobId === 'task:daily:2026-06-04')).toMatchObject({ scheduledFor: '2026-06-06T09:30:00' });
  });
});
