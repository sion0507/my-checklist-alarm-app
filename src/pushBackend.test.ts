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
});
