import webpush from 'web-push';
import { createPushHttpApi } from '../../src/pushHttpApi';
import type { PushPayload, StoredPushSubscription } from '../../src/pushBackend';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const pushSenderEnabled = process.env.PUSH_TEST_SENDER_ENABLED === 'true';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

async function sendPush(subscription: StoredPushSubscription, payload: PushPayload) {
  if (!pushSenderEnabled || !vapidPublicKey || !vapidPrivateKey) {
    throw new Error('Web Push sender is not configured');
  }

  const result = await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime,
      keys: subscription.keys,
    },
    JSON.stringify(payload),
  );

  return { ok: result.statusCode >= 200 && result.statusCode < 300, status: result.statusCode };
}

const api = createPushHttpApi({
  vapidPublicKey,
  sendPush,
});

function absoluteUrl(req: { headers: Record<string, string | string[] | undefined>; url?: string }) {
  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host || 'localhost';
  const protocol = Array.isArray(req.headers['x-forwarded-proto'])
    ? req.headers['x-forwarded-proto'][0]
    : req.headers['x-forwarded-proto'] || 'https';
  return `${protocol}://${host}${req.url || '/api/push/unknown'}`;
}

function readBody(req: { body?: unknown }) {
  if (typeof req.body === 'string') {
    return req.body;
  }
  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }
  return undefined;
}

export default async function handler(req: any, res: any) {
  const request = new Request(absoluteUrl(req), {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
    body: req.method === 'GET' ? undefined : readBody(req),
  });
  const result = await api.handle(request);
  res.status(result.status).json(result.body);
}
