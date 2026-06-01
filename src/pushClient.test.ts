import { describe, expect, it, vi } from 'vitest';
import { enablePushSubscription, sendBackendTestPush } from './pushClient';

function installNotification(permission: NotificationPermission, requestResult = permission) {
  const requestPermission = vi.fn().mockResolvedValue(requestResult);
  vi.stubGlobal('Notification', { permission, requestPermission });
  return { requestPermission };
}

function installServiceWorker(subscription: PushSubscription | null = null) {
  const subscribe = vi.fn().mockResolvedValue({
    endpoint: 'https://push.example/device-1',
    toJSON: () => ({
      endpoint: 'https://push.example/device-1',
      expirationTime: null,
      keys: { p256dh: 'client-public-key', auth: 'client-auth-secret' },
    }),
  });
  const getSubscription = vi.fn().mockResolvedValue(subscription);
  const registration = {
    pushManager: {
      getSubscription,
      subscribe,
    },
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve(registration),
      register: vi.fn().mockResolvedValue(registration),
    },
  });
  return { registration, getSubscription, subscribe };
}

describe('push client subscription flow', () => {
  it('requests permission, subscribes with the VAPID public key, and syncs minimal metadata to the backend', async () => {
    const { requestPermission } = installNotification('default', 'granted');
    const { subscribe } = installServiceWorker();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/push/vapid-public-key') {
        return new Response(JSON.stringify({ publicKey: 'BElAQID' }), { status: 200 });
      }
      if (url === '/api/push/subscriptions') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const result = await enablePushSubscription({
      fetcher: fetchMock,
      metadata: { timezone: 'Asia/Seoul', morningTime: '08:00', eveningTime: '23:00' },
    });

    expect(result).toEqual({ ok: true, endpoint: 'https://push.example/device-1' });
    expect(requestPermission).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/push/subscriptions',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('Asia/Seoul'),
      }),
    );
    expect(fetchMock.mock.calls[1][1]?.body as string).not.toContain('tasks');
  });

  it('returns permission and service worker error states without calling the backend', async () => {
    installNotification('denied');
    const fetcher = vi.fn();
    await expect(enablePushSubscription({ fetcher })).rejects.toThrow('Notification permission was denied');
    expect(fetcher).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    installNotification('granted');
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
    await expect(enablePushSubscription({ fetcher })).rejects.toThrow('Service workers are not supported');
  });

  it('surfaces backend sync and test push failures', async () => {
    installNotification('granted');
    installServiceWorker();

    await expect(
      enablePushSubscription({
        fetcher: vi.fn(async (input: RequestInfo | URL) =>
          String(input).endsWith('vapid-public-key')
            ? new Response(JSON.stringify({ publicKey: 'BElAQID' }), { status: 200 })
            : new Response(JSON.stringify({ error: 'store failed' }), { status: 500 }),
        ),
      }),
    ).rejects.toThrow('store failed');

    await expect(
      sendBackendTestPush('https://push.example/device-1', {
        fetcher: vi.fn(async () => new Response(JSON.stringify({ error: 'send failed' }), { status: 503 })),
      }),
    ).rejects.toThrow('send failed');
  });
});
