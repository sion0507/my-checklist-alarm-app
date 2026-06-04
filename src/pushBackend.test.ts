import { describe, expect, it, vi } from 'vitest';
import { createInMemoryPushStore, createPushBackend, createPushPayload, type StoredPushSubscription } from './pushBackend';
import { createPushHttpApi } from './pushHttpApi';

function subscription(endpoint = 'https://push.example/device-1') {
  return {
    endpoint,
    expirationTime: null,
    keys: {
      p256dh: 'client-public-key',
      auth: 'client-auth-secret',
    },
  };
}

describe('push backend API behavior', () => {
  it('upserts only push subscription and minimal notification metadata', async () => {
    const backend = createPushBackend({ vapidPublicKey: 'public-key' });

    const result = await backend.upsertSubscription({
      subscription: subscription(),
      metadata: {
        timezone: 'Asia/Seoul',
        userAgent: 'Vitest Browser',
        morningTime: '08:00',
        eveningTime: '23:00',
      },
      ignoredLocalTasks: [{ title: 'must not be stored' }],
    });

    expect(result).toEqual({ ok: true, endpoint: 'https://push.example/device-1' });
    const stored = backend.getSubscription('https://push.example/device-1') as StoredPushSubscription;
    expect(stored).toMatchObject({
      endpoint: 'https://push.example/device-1',
      keys: { p256dh: 'client-public-key', auth: 'client-auth-secret' },
      metadata: {
        timezone: 'Asia/Seoul',
        userAgent: 'Vitest Browser',
        morningTime: '08:00',
        eveningTime: '23:00',
      },
    });
    expect(JSON.stringify(stored)).not.toContain('must not be stored');
  });

  it('rejects invalid subscriptions without an endpoint or keys', async () => {
    const backend = createPushBackend({ vapidPublicKey: 'public-key' });

    await expect(
      backend.upsertSubscription({ subscription: { endpoint: '', keys: { p256dh: 'a', auth: 'b' } } }),
    ).rejects.toThrow('Push subscription endpoint is required');
    await expect(
      backend.upsertSubscription({ subscription: { endpoint: 'https://push.example/device-1', keys: { p256dh: '', auth: 'b' } } }),
    ).rejects.toThrow('Push subscription keys are required');
  });

  it('sends a minimal test payload through an injected sender', async () => {
    const sendPush = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    const backend = createPushBackend({ vapidPublicKey: 'public-key', sendPush });
    await backend.upsertSubscription({ subscription: subscription() });

    const result = await backend.sendTestNotification('https://push.example/device-1');

    expect(result).toEqual({ ok: true, status: 201 });
    expect(sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example/device-1' }),
      createPushPayload({
        title: 'Checklist Alarm 테스트',
        body: '백엔드 경유 테스트 알림입니다.',
        path: '/?source=test-push',
      }),
    );
  });

  it('reports missing sender and unknown subscriptions as explicit backend errors', async () => {
    const backend = createPushBackend({ vapidPublicKey: 'public-key' });
    await backend.upsertSubscription({ subscription: subscription() });

    await expect(backend.sendTestNotification('https://push.example/device-1')).rejects.toThrow(
      'Web Push sender is not configured',
    );
    await expect(backend.sendTestNotification('https://push.example/missing')).rejects.toThrow('Push subscription not found');
  });

  it('exposes free-tier HTTP route behavior for public keys, subscription sync, and test push', async () => {
    const sendPush = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    const api = createPushHttpApi({ vapidPublicKey: 'public-key', sendPush });

    await expect(api.handle(new Request('https://app.example/api/push/vapid-public-key'))).resolves.toEqual({
      status: 200,
      body: { publicKey: 'public-key' },
    });

    await expect(
      api.handle(
        new Request('https://app.example/api/push/subscriptions', {
          method: 'PUT',
          body: JSON.stringify({ subscription: subscription(), metadata: { timezone: 'Asia/Seoul' } }),
        }),
      ),
    ).resolves.toEqual({ status: 200, body: { ok: true, endpoint: 'https://push.example/device-1' } });

    await expect(
      api.handle(
        new Request('https://app.example/api/push/test', {
          method: 'POST',
          body: JSON.stringify({ endpoint: 'https://push.example/device-1' }),
        }),
      ),
    ).resolves.toEqual({ status: 200, body: { ok: true, status: 201 } });
  });

  it('replaces scheduled jobs with minimal derived metadata and marks missing jobs cancelled', async () => {
    const backend = createPushBackend({ vapidPublicKey: 'public-key', now: () => new Date('2026-06-01T00:00:00.000Z') });
    await backend.replaceScheduledJobs({
      endpoint: 'https://push.example/device-1',
      jobs: [
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
          ignoredLocalTask: { memo: 'must not be stored', completed: false },
        },
      ],
    });

    await expect(
      backend.replaceScheduledJobs({
        endpoint: 'https://push.example/device-1',
        jobs: [
          {
            jobId: 'morning:2026-06-01',
            kind: 'morning',
            scheduledFor: '2026-06-01T08:00:00',
            metadata: { title: '아침 알림', path: '/?date=2026-06-01' },
          },
        ],
      }),
    ).resolves.toEqual({ ok: true, upserted: 1, cancelled: 1 });

    const records = backend.listScheduledJobs('https://push.example/device-1');
    expect(records).toContainEqual(expect.objectContaining({ jobId: 'morning:2026-06-01', state: 'scheduled' }));
    expect(records).toContainEqual(expect.objectContaining({ jobId: 'task:task-1:2026-06-01', state: 'cancelled' }));
    expect(JSON.stringify(records)).not.toContain('must not be stored');
    expect(JSON.stringify(records)).not.toContain('completed');
  });

  it('serves schedule replacement through the HTTP API', async () => {
    const api = createPushHttpApi({ vapidPublicKey: 'public-key' });

    await expect(
      api.handle(
        new Request('https://app.example/api/push/schedule', {
          method: 'POST',
          body: JSON.stringify({
            endpoint: 'https://push.example/device-1',
            jobs: [
              {
                jobId: 'evening:2026-06-01',
                kind: 'evening',
                scheduledFor: '2026-06-01T23:00:00',
                metadata: { title: '저녁 리뷰', path: '/?date=2026-06-01' },
              },
            ],
          }),
        }),
      ),
    ).resolves.toEqual({ status: 200, body: { ok: true, upserted: 1, cancelled: 0 } });
  });

  it('persists subscriptions and scheduled jobs through an injected durable store across backend instances', async () => {
    const store = createInMemoryPushStore();
    const firstBackend = createPushBackend({ vapidPublicKey: 'public-key', store, now: () => new Date('2026-06-01T00:00:00.000Z') });
    await firstBackend.upsertSubscription({ subscription: subscription(), metadata: { timezone: 'Asia/Seoul' } });
    await firstBackend.replaceScheduledJobs({
      endpoint: 'https://push.example/device-1',
      jobs: [
        {
          jobId: 'morning:2026-06-01',
          kind: 'morning',
          scheduledFor: '2026-06-01T08:00:00',
          metadata: { title: '아침 알림', path: '/?date=2026-06-01' },
        },
      ],
    });

    const secondBackend = createPushBackend({ vapidPublicKey: 'public-key', store });

    expect(secondBackend.getSubscription('https://push.example/device-1')).toMatchObject({
      endpoint: 'https://push.example/device-1',
      metadata: { timezone: 'Asia/Seoul' },
    });
    expect(secondBackend.listScheduledJobs('https://push.example/device-1')).toContainEqual(
      expect.objectContaining({ jobId: 'morning:2026-06-01', state: 'scheduled' }),
    );
  });

  it('sends due morning, task-time, and evening jobs while recording delivery attempts', async () => {
    const sendPush = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    const backend = createPushBackend({
      vapidPublicKey: 'public-key',
      sendPush,
      now: () => new Date('2026-06-01T23:05:00.000Z'),
    });
    await backend.upsertSubscription({ subscription: subscription() });
    await backend.replaceScheduledJobs({
      endpoint: 'https://push.example/device-1',
      jobs: [
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
          metadata: { taskId: 'task-1', occurrenceDate: '2026-06-01', title: '할 일', path: '/?date=2026-06-01&taskId=task-1' },
        },
        {
          jobId: 'evening:2026-06-01',
          kind: 'evening',
          scheduledFor: '2026-06-01T23:00:00',
          metadata: { title: '저녁 리뷰', path: '/?date=2026-06-01' },
        },
        {
          jobId: 'morning:2026-06-02',
          kind: 'morning',
          scheduledFor: '2026-06-02T08:00:00',
          metadata: { title: '내일 아침 알림', path: '/?date=2026-06-02' },
        },
      ],
    });

    const result = await backend.sendDueScheduledNotifications({ limit: 10 });

    expect(result).toEqual({ ok: true, attempted: 3, sent: 3, failed: 0, remainingDue: 0 });
    expect(sendPush).toHaveBeenCalledTimes(3);
    expect(sendPush.mock.calls.map(([, payload]) => payload)).toEqual([
      { title: '아침 알림', body: '오늘 체크리스트를 확인해 주세요.', path: '/?date=2026-06-01' },
      { title: '할 일', body: '예약된 할 일 시간입니다.', path: '/?date=2026-06-01&taskId=task-1' },
      { title: '저녁 리뷰', body: '오늘 남은 할 일을 리뷰해 주세요.', path: '/?date=2026-06-01' },
    ]);
    expect(backend.listScheduledJobs('https://push.example/device-1')).toContainEqual(
      expect.objectContaining({ jobId: 'evening:2026-06-01', state: 'completed', attempts: 1, lastStatus: 201 }),
    );
  });

  it('uses subscription timezone metadata when deciding whether local scheduled jobs are due', async () => {
    const sendPush = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    const backend = createPushBackend({
      vapidPublicKey: 'public-key',
      sendPush,
      now: () => new Date('2026-05-31T23:05:00.000Z'),
    });
    await backend.upsertSubscription({ subscription: subscription(), metadata: { timezone: 'Asia/Seoul' } });
    await backend.replaceScheduledJobs({
      endpoint: 'https://push.example/device-1',
      jobs: [
        {
          jobId: 'morning:2026-06-01',
          kind: 'morning',
          scheduledFor: '2026-06-01T08:00:00',
          metadata: { title: '아침 알림', path: '/?date=2026-06-01' },
        },
      ],
    });

    await expect(backend.sendDueScheduledNotifications()).resolves.toMatchObject({ attempted: 1, sent: 1 });
  });

  it('blocks production cron delivery when no secret is configured', async () => {
    const sendPush = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    const api = createPushHttpApi({ vapidPublicKey: 'public-key', sendPush });

    await expect(
      api.handle(
        new Request('https://app.example/api/push/cron', {
          method: 'POST',
        }),
      ),
    ).resolves.toEqual({ status: 401, body: { error: 'Cron request is not authorized' } });
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('blocks production cron delivery for an incorrect secret', async () => {
    const sendPush = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    const api = createPushHttpApi({ vapidPublicKey: 'public-key', sendPush, cronSecret: 'correct-secret' });

    await expect(
      api.handle(
        new Request('https://app.example/api/push/cron', {
          method: 'POST',
          headers: { Authorization: 'Bearer wrong-secret' },
        }),
      ),
    ).resolves.toEqual({ status: 401, body: { error: 'Cron request is not authorized' } });
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('does not trust the Vercel cron header without the configured secret', async () => {
    const sendPush = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    const api = createPushHttpApi({ vapidPublicKey: 'public-key', sendPush, cronSecret: 'correct-secret' });

    await expect(
      api.handle(
        new Request('https://app.example/api/push/cron', {
          method: 'POST',
          headers: { 'x-vercel-cron': '1' },
        }),
      ),
    ).resolves.toEqual({ status: 401, body: { error: 'Cron request is not authorized' } });
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('exposes due scheduled delivery through the HTTP cron route with the configured secret', async () => {
    const sendPush = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    const api = createPushHttpApi({
      vapidPublicKey: 'public-key',
      sendPush,
      now: () => new Date('2026-06-01T08:05:00.000Z'),
      cronSecret: 'correct-secret',
    });
    await api.backend.upsertSubscription({ subscription: subscription() });
    await api.backend.replaceScheduledJobs({
      endpoint: 'https://push.example/device-1',
      jobs: [
        {
          jobId: 'morning:2026-06-01',
          kind: 'morning',
          scheduledFor: '2026-06-01T08:00:00',
          metadata: { title: '아침 알림', path: '/?date=2026-06-01' },
        },
      ],
    });

    await expect(
      api.handle(
        new Request('https://app.example/api/push/cron', {
          method: 'POST',
          headers: { Authorization: 'Bearer correct-secret', 'x-vercel-cron': '1' },
        }),
      ),
    ).resolves.toEqual({ status: 200, body: { ok: true, attempted: 1, sent: 1, failed: 0, remainingDue: 0 } });
  });
});
