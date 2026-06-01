import { describe, expect, it, vi } from 'vitest';
import { syncUpcomingNotificationSchedule } from './scheduleSyncClient';
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

describe('schedule sync client', () => {
  it('sends endpoint and derived jobs to the backend without local task data', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, upserted: 2, cancelled: 1 }), { status: 200 }));

    await expect(syncUpcomingNotificationSchedule({ endpoint: 'https://push.example/device-1', jobs, fetcher })).resolves.toEqual({
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
