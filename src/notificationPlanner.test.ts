import { describe, expect, it } from 'vitest';
import { buildUpcomingNotificationSchedule, type ReminderScheduleSettings } from './notificationPlanner';
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

describe('upcoming notification schedule planner', () => {
  it('derives morning, evening, and time-specific jobs inside the next three days only by default', () => {
    const jobs = buildUpcomingNotificationSchedule({
      tasks: [task({ id: 'inside', date: '2026-06-03' }), task({ id: 'outside', date: '2026-06-04' })],
      settings,
      startDate: '2026-06-01',
    });

    expect(jobs.filter((job) => job.kind === 'morning')).toHaveLength(3);
    expect(jobs.filter((job) => job.kind === 'evening')).toHaveLength(1);
    expect(jobs.map((job) => job.scheduledFor)).toContain('2026-06-01T08:00:00');
    expect(jobs.map((job) => job.scheduledFor)).toContain('2026-06-03T23:00:00');
    expect(jobs.map((job) => job.scheduledFor)).not.toContain('2026-06-04T23:00:00');
    expect(jobs.find((job) => job.jobId === 'morning:2026-06-01')).toMatchObject({
      metadata: { title: '아침 체크리스트 알림', path: '/?date=2026-06-01&entry=morning&time=08%3A00' },
    });
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
    expect(jobs.map((job) => job.jobId)).not.toContain('task:outside:2026-06-04');
    expect(JSON.stringify(jobs)).not.toContain('local-only memo');
  });

  it('supports an explicit lookahead when callers need a longer schedule', () => {
    const jobs = buildUpcomingNotificationSchedule({
      tasks: [task({ id: 'inside', date: '2026-06-05' })],
      settings,
      startDate: '2026-06-01',
      days: 5,
    });

    expect(jobs.filter((job) => job.kind === 'morning')).toHaveLength(5);
    expect(jobs.map((job) => job.jobId)).toContain('task:inside:2026-06-05');
  });

  it('schedules evening review only for dates with unfinished tasks', () => {
    const jobs = buildUpcomingNotificationSchedule({
      tasks: [
        task({ id: 'done', date: '2026-06-01', completed: true }),
        task({ id: 'unfinished', date: '2026-06-02', completed: false, notify: false, time: '' }),
      ],
      settings,
      startDate: '2026-06-01',
    });

    expect(jobs).not.toContainEqual(expect.objectContaining({ jobId: 'evening:2026-06-01' }));
    expect(jobs).toContainEqual(
      expect.objectContaining({
        jobId: 'evening:2026-06-02',
        kind: 'evening',
        scheduledFor: '2026-06-02T23:00:00',
        metadata: { title: '저녁 체크리스트 리뷰', path: '/?date=2026-06-02&entry=evening' },
      }),
    );
  });

  it('uses configurable morning reminder time with 08:00 as the documented default setting', () => {
    const defaultJobs = buildUpcomingNotificationSchedule({ tasks: [], settings, startDate: '2026-06-01' });
    const customJobs = buildUpcomingNotificationSchedule({
      tasks: [],
      settings: { ...settings, morningTime: '07:15' },
      startDate: '2026-06-01',
    });

    expect(defaultJobs.find((job) => job.jobId === 'morning:2026-06-01')).toMatchObject({ scheduledFor: '2026-06-01T08:00:00' });
    expect(customJobs.find((job) => job.jobId === 'morning:2026-06-01')).toMatchObject({ scheduledFor: '2026-06-01T07:15:00' });
  });

  it('derives recurrence occurrences and respects completed, deleted, moved, and notify-off state inside the three-day horizon', () => {
    const jobs = buildUpcomingNotificationSchedule({
      tasks: [
        task({ id: 'daily', date: '2026-06-01', recurrence: 'daily', exceptions: { '2026-06-02': { completed: true }, '2026-06-03': { deleted: true }, '2026-06-04': { movedTo: '2026-06-06' } } }),
        task({ id: 'weekly-off', date: '2026-06-01', recurrence: 'weekly', notify: false }),
        task({ id: 'completed-once', date: '2026-06-05', completed: true }),
      ],
      settings,
      startDate: '2026-06-01',
    }).filter((job) => job.kind === 'task');

    expect(jobs.map((job) => job.jobId)).toEqual(['task:daily:2026-06-01']);
  });
});
