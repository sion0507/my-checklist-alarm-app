import { describe, expect, it, vi } from 'vitest';
import { createPushBackend, createPushPayload, type StoredPushSubscription } from './pushBackend';
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
});
