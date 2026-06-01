import type { MinimalPushSubscription, NotificationMetadata } from './pushBackend';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type PushClientOptions = {
  apiBase?: string;
  fetcher?: Fetcher;
  metadata?: NotificationMetadata;
};

type BackendError = {
  error?: string;
};

function ensureNotificationSupport() {
  if (!('Notification' in window)) {
    throw new Error('Notifications are not supported');
  }
}

async function ensureNotificationPermission() {
  ensureNotificationSupport();
  if (Notification.permission === 'granted') {
    return;
  }
  if (Notification.permission === 'denied') {
    throw new Error('Notification permission was denied');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied');
  }
}

function ensureServiceWorkerSupport() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker) {
    throw new Error('Service workers are not supported');
  }
}

function decodeBase64Url(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function normalizeSubscription(subscription: PushSubscription): MinimalPushSubscription {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('Push subscription is missing endpoint or keys');
  }
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  };
}

async function parseBackendError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as BackendError;
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

async function fetchVapidPublicKey(apiBase: string, fetcher: Fetcher) {
  const response = await fetcher(`${apiBase}/vapid-public-key`);
  if (!response.ok) {
    throw new Error(await parseBackendError(response, 'Failed to load Web Push public key'));
  }
  const body = (await response.json()) as { publicKey?: string };
  if (!body.publicKey) {
    throw new Error('Web Push public key is missing');
  }
  return body.publicKey;
}

export async function enablePushSubscription({ apiBase = '/api/push', fetcher = fetch, metadata = {} }: PushClientOptions = {}) {
  await ensureNotificationPermission();
  ensureServiceWorkerSupport();

  const registration = await navigator.serviceWorker.ready;
  const publicKey = await fetchVapidPublicKey(apiBase, fetcher);
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(publicKey),
    }));
  const normalizedSubscription = normalizeSubscription(subscription);

  const response = await fetcher(`${apiBase}/subscriptions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: normalizedSubscription,
      metadata,
    }),
  });
  if (!response.ok) {
    throw new Error(await parseBackendError(response, 'Failed to save push subscription'));
  }

  return { ok: true, endpoint: normalizedSubscription.endpoint };
}

export async function sendBackendTestPush(
  endpoint: string,
  { apiBase = '/api/push', fetcher = fetch }: Pick<PushClientOptions, 'apiBase' | 'fetcher'> = {},
) {
  const response = await fetcher(`${apiBase}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) {
    throw new Error(await parseBackendError(response, 'Failed to send test push'));
  }
  return response.json() as Promise<{ ok: boolean; status?: number }>;
}
