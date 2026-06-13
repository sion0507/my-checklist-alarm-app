import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncUpcomingNotificationSchedule, resetScheduleSyncCache } from './scheduleSyncClient';
import type { ScheduledNotificationJob } from './notificationPlanner';

const jobs: ScheduledNotificationJob[] = [
  {
    jobId: 'morning:2026-06-01',
    kind: 'morning',
    scheduledFor: '2026-06-01T08:00:00',
    metadata: { title: '아침 알림', path: '/?date=2026-06-01' },
  },
  {
    jobId: 'task:task-1:2026-06-01',
    kind: 'task',
    scheduledFor: '2026-06-01T09:30:00',
    metadata: { taskId: 'task-1', occurrenceDate: '2026-06-01', title: '할 일', path: '/?date=2026-06-01' },
  },
];

const storageKey = 'checklist-alarm:notification-schedule-sync';

describe('schedule sync client', () => {
  beforeEach(() => {
    localStorage.clear();
    resetScheduleSyncCache();
  });

  it('sends endpoint and derived jobs to the backend without local task data', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, upserted: 2, cancelled: 1 }), { status: 200 }));

    await expect(syncUpcomingNotificationSchedule({ endpoint: 'https://push.example/device-1', jobs, fetcher, now: () => 1_000 })).resolves.toEqual({
      ok: true,
      upserted: 2,
      cancelled: 1,
    });

    expect(fetcher).toHaveBeenCalledWith(
      '/api/push/schedule',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const firstCall = fetcher.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(firstCall[1].body as string);
    expect(body).toEqual({ endpoint: 'https://push.example/device-1', jobs });
    expect(JSON.stringify(body)).not.toContain('memo');
    expect(JSON.stringify(body)).not.toContain('completed');
  });

  it('skips identical schedules until a force-sync condition is met', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, upserted: 2, cancelled: 0 }), { status: 200 }));

    await expect(syncUpcomingNotificationSchedule({ endpoint: 'https://push.example/device-1', jobs, fetcher, now: () => 1_000 })).resolves.toMatchObject({ ok: true });
    await expect(syncUpcomingNotificationSchedule({ endpoint: 'https://push.example/device-1', jobs: [...jobs].reverse(), fetcher, now: () => 2_000 })).resolves.toEqual({
      ok: false,
      skipped: true,
      reason: 'schedule unchanged',
    });
    await expect(syncUpcomingNotificationSchedule({ endpoint: 'https://push.example/device-1', jobs, fetcher, now: () => 13 * 60 * 60 * 1_000 })).resolves.toMatchObject({ ok: true });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '{}')).toMatchObject({
      endpoint: 'https://push.example/device-1',
      schemaVersion: expect.any(String),
      horizonDays: 3,
    });
  });

  it('force-syncs when endpoint, schema version, horizon, or explicit reset changes', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, upserted: 2, cancelled: 0 }), { status: 200 }));

    await syncUpcomingNotificationSchedule({ endpoint: 'https://push.example/device-1', jobs, fetcher, now: () => 1_000 });
    await syncUpcomingNotificationSchedule({ endpoint: 'https://push.example/device-2', jobs, fetcher, now: () => 2_000 });
    await syncUpcomingNotificationSchedule({ endpoint: 'https://push.example/device-2', jobs, fetcher, schemaVersion: 'next-schema', now: () => 3_000 });
    await syncUpcomingNotificationSchedule({ endpoint: 'https://push.example/device-2', jobs, fetcher, schemaVersion: 'next-schema', horizonDays: 2, now: () => 4_000 });
    resetScheduleSyncCache();
    await syncUpcomingNotificationSchedule({ endpoint: 'https://push.example/device-2', jobs, fetcher, schemaVersion: 'next-schema', horizonDays: 2, now: () => 5_000 });

    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it('skips sync when there is no push subscription endpoint and surfaces backend failures', async () => {
    const unusedFetcher = vi.fn();
    await expect(syncUpcomingNotificationSchedule({ endpoint: null, jobs, fetcher: unusedFetcher })).resolves.toEqual({
      ok: false,
      skipped: true,
      reason: 'missing endpoint',
    });
    expect(unusedFetcher).not.toHaveBeenCalled();

    await expect(
      syncUpcomingNotificationSchedule({
        endpoint: 'https://push.example/device-1',
        jobs,
        fetcher: vi.fn(async () => new Response(JSON.stringify({ error: 'schedule failed' }), { status: 500 })),
      }),
    ).rejects.toThrow('schedule failed');
  });
});
