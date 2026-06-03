import webpush from 'web-push';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const pushSenderEnabled = process.env.PUSH_TEST_SENDER_ENABLED === 'true';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

const subscriptions = new Map();
const scheduledJobs = new Map();

function json(res, status, body) {
  res.status(status).json(body);
}

function readBody(req) {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  return {};
}

function validateSubscription(subscription) {
  if (!subscription?.endpoint) {
    throw new Error('Push subscription endpoint is required');
  }
  if (!subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error('Push subscription keys are required');
  }
}

async function sendPush(subscription, payload) {
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

function upsertSubscription({ subscription, metadata = {} }) {
  validateSubscription(subscription);
  const previous = subscriptions.get(subscription.endpoint);
  const timestamp = new Date().toISOString();
  const stored = {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    metadata: {
      timezone: metadata.timezone,
      userAgent: metadata.userAgent,
      morningTime: metadata.morningTime,
      eveningTime: metadata.eveningTime,
    },
    createdAt: previous?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  subscriptions.set(subscription.endpoint, stored);
  return { ok: true, endpoint: stored.endpoint };
}

async function sendTestNotification(endpoint) {
  const subscription = subscriptions.get(endpoint);
  if (!subscription) {
    throw new Error('Push subscription not found');
  }
  return sendPush(subscription, {
    title: 'Checklist Alarm 테스트',
    body: '백엔드 경유 테스트 알림입니다.',
    path: '/?source=test-push',
  });
}

function replaceScheduledJobs({ endpoint, jobs }) {
  if (!endpoint) {
    throw new Error('Push subscription endpoint is required');
  }
  const timestamp = new Date().toISOString();
  const incomingIds = new Set(jobs.map((job) => job.jobId));
  let cancelled = 0;

  for (const [key, record] of scheduledJobs.entries()) {
    if (record.endpoint === endpoint && record.state === 'scheduled' && !incomingIds.has(record.jobId)) {
      scheduledJobs.set(key, {
        ...record,
        state: 'cancelled',
        updatedAt: timestamp,
        cancelledAt: timestamp,
      });
      cancelled += 1;
    }
  }

  for (const job of jobs) {
    const key = `${endpoint}:${job.jobId}`;
    const previous = scheduledJobs.get(key);
    scheduledJobs.set(key, {
      endpoint,
      jobId: job.jobId,
      kind: job.kind,
      scheduledFor: job.scheduledFor,
      metadata: {
        title: job.metadata.title,
        path: job.metadata.path,
        taskId: job.metadata.taskId,
        occurrenceDate: job.metadata.occurrenceDate,
      },
      state: 'scheduled',
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
  }

  return { ok: true, upserted: jobs.length, cancelled };
}

export default async function handler(req, res) {
  const action = Array.isArray(req.query?.action) ? req.query.action.at(-1) : req.query?.action;

  try {
    if (req.method === 'GET' && action === 'vapid-public-key') {
      return json(res, 200, { publicKey: vapidPublicKey });
    }

    if (req.method === 'PUT' && action === 'subscriptions') {
      return json(res, 200, upsertSubscription(readBody(req)));
    }

    if (req.method === 'POST' && action === 'test') {
      const body = readBody(req);
      if (typeof body.endpoint !== 'string') {
        return json(res, 400, { error: 'Push subscription endpoint is required' });
      }
      return json(res, 200, await sendTestNotification(body.endpoint));
    }

    if (req.method === 'POST' && action === 'schedule') {
      const body = readBody(req);
      if (typeof body.endpoint !== 'string' || !Array.isArray(body.jobs)) {
        return json(res, 400, { error: 'Push subscription endpoint and jobs are required' });
      }
      return json(res, 200, replaceScheduledJobs(body));
    }

    return json(res, 404, { error: 'Push API route not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push API request failed';
    if (message.includes('not configured')) {
      return json(res, 503, { error: message });
    }
    if (message.includes('not found')) {
      return json(res, 404, { error: message });
    }
    return json(res, 400, { error: message });
  }
}
