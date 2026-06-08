import webpush from 'web-push';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const pushSenderEnabled = process.env.PUSH_TEST_SENDER_ENABLED === 'true' || process.env.PUSH_SENDER_ENABLED === 'true';
const cronSecret = process.env.CRON_SECRET || '';
const allowUnauthenticatedCron = process.env.ALLOW_UNAUTHENTICATED_CRON === 'true' && process.env.NODE_ENV !== 'production';
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

const memoryStore = {
  subscriptions: new Map(),
  subscriptionKeys: new Set(),
  scheduledJobs: new Map(),
  jobKeysByEndpoint: new Map(),
  allJobKeys: new Set(),
};

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

function isRedisConfigured() {
  return Boolean(redisUrl && redisToken);
}

function encodeKeyPart(value) {
  return Buffer.from(value).toString('base64url');
}

function subscriptionKey(endpoint) {
  return `push:subscription:${encodeKeyPart(endpoint)}`;
}

function jobKey(endpoint, jobId) {
  return `push:job:${encodeKeyPart(endpoint)}:${encodeKeyPart(jobId)}`;
}

function endpointJobsKey(endpoint) {
  return `push:jobs:${encodeKeyPart(endpoint)}`;
}

async function redisCommand(command) {
  const response = await fetch(redisUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redisToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) {
    throw new Error(`Durable storage request failed with status ${response.status}`);
  }
  const body = await response.json();
  if (body.error) {
    throw new Error(`Durable storage error: ${body.error}`);
  }
  return body.result;
}

async function redisSetJson(key, value) {
  await redisCommand(['SET', key, JSON.stringify(value)]);
}

async function redisGetJson(key) {
  const result = await redisCommand(['GET', key]);
  return typeof result === 'string' ? JSON.parse(result) : null;
}

async function redisSetMembers(key) {
  const result = await redisCommand(['SMEMBERS', key]);
  return Array.isArray(result) ? result : [];
}

async function redisAddSetMember(key, member) {
  await redisCommand(['SADD', key, member]);
}

async function getSubscription(endpoint) {
  if (isRedisConfigured()) {
    return redisGetJson(subscriptionKey(endpoint));
  }
  return memoryStore.subscriptions.get(endpoint) ?? null;
}

async function setSubscription(subscription) {
  if (isRedisConfigured()) {
    await redisSetJson(subscriptionKey(subscription.endpoint), subscription);
    await redisAddSetMember('push:subscriptions', subscription.endpoint);
    return;
  }
  memoryStore.subscriptions.set(subscription.endpoint, subscription);
  memoryStore.subscriptionKeys.add(subscription.endpoint);
}

async function getJob(key) {
  if (isRedisConfigured()) {
    return redisGetJson(key);
  }
  return memoryStore.scheduledJobs.get(key) ?? null;
}

async function setJob(key, record) {
  if (isRedisConfigured()) {
    await redisSetJson(key, record);
    await redisAddSetMember(endpointJobsKey(record.endpoint), key);
    await redisAddSetMember('push:jobs', key);
    return;
  }
  memoryStore.scheduledJobs.set(key, record);
  const endpointKey = endpointJobsKey(record.endpoint);
  if (!memoryStore.jobKeysByEndpoint.has(endpointKey)) {
    memoryStore.jobKeysByEndpoint.set(endpointKey, new Set());
  }
  memoryStore.jobKeysByEndpoint.get(endpointKey).add(key);
  memoryStore.allJobKeys.add(key);
}

async function listJobKeysForEndpoint(endpoint) {
  if (isRedisConfigured()) {
    return redisSetMembers(endpointJobsKey(endpoint));
  }
  return [...(memoryStore.jobKeysByEndpoint.get(endpointJobsKey(endpoint)) ?? [])];
}

async function listAllJobKeys() {
  if (isRedisConfigured()) {
    return redisSetMembers('push:jobs');
  }
  return [...memoryStore.allJobKeys];
}

function createPushPayload(payload) {
  return {
    title: payload.title,
    body: payload.body,
    path: payload.path,
  };
}

function defaultBody(kind) {
  if (kind === 'morning') {
    return '오늘 체크리스트를 확인해 주세요.';
  }
  if (kind === 'evening') {
    return '오늘 남은 할 일을 리뷰해 주세요.';
  }
  return '예약된 할 일 시간입니다.';
}

const DAILY_NOTIFICATION_DELIVERY_WINDOW_MILLIS = 15 * 60 * 1000;

function isDailyNotificationKind(kind) {
  return kind === 'morning' || kind === 'evening';
}

function getTimeZoneOffsetMillis(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return asUtc - date.getTime();
}

function scheduledForMillis(scheduledFor, timeZone) {
  if (!timeZone) {
    return new Date(scheduledFor).getTime();
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(scheduledFor);
  if (!match) {
    return new Date(scheduledFor).getTime();
  }
  const [, year, month, day, hour, minute, second] = match;
  const utcGuess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  try {
    const firstPass = utcGuess - getTimeZoneOffsetMillis(new Date(utcGuess), timeZone);
    return utcGuess - getTimeZoneOffsetMillis(new Date(firstPass), timeZone);
  } catch {
    return new Date(scheduledFor).getTime();
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

async function upsertSubscription({ subscription, metadata = {} }) {
  validateSubscription(subscription);
  const previous = await getSubscription(subscription.endpoint);
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
  await setSubscription(stored);
  return { ok: true, endpoint: stored.endpoint, durable: isRedisConfigured() };
}

async function sendTestNotification(endpoint) {
  const subscription = await getSubscription(endpoint);
  if (!subscription) {
    throw new Error('Push subscription not found');
  }
  return sendPush(subscription, {
    title: 'Checklist Alarm 테스트',
    body: '백엔드 경유 테스트 알림입니다.',
    path: '/?source=test-push',
  });
}

async function replaceScheduledJobs({ endpoint, jobs }) {
  if (!endpoint) {
    throw new Error('Push subscription endpoint is required');
  }
  const timestamp = new Date().toISOString();
  const incomingIds = new Set(jobs.map((job) => job.jobId));
  let cancelled = 0;

  for (const key of await listJobKeysForEndpoint(endpoint)) {
    const record = await getJob(key);
    if (record?.endpoint === endpoint && record.state === 'scheduled' && !incomingIds.has(record.jobId)) {
      await setJob(key, {
        ...record,
        state: 'cancelled',
        updatedAt: timestamp,
        cancelledAt: timestamp,
      });
      cancelled += 1;
    }
  }

  for (const job of jobs) {
    const key = jobKey(endpoint, job.jobId);
    const previous = await getJob(key);
    const nextState = previous?.state === 'completed' ? 'completed' : 'scheduled';
    await setJob(key, {
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
      state: nextState,
      attempts: previous?.attempts ?? 0,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
      lastAttemptAt: previous?.lastAttemptAt,
      completedAt: previous?.completedAt,
      lastStatus: previous?.lastStatus,
      lastError: previous?.lastError,
    });
  }

  return { ok: true, upserted: jobs.length, cancelled, durable: isRedisConfigured() };
}

async function sendDueScheduledNotifications({ limit = 25 } = {}) {
  const now = new Date();
  const timestamp = now.toISOString();
  const currentTime = now.getTime();
  const records = [];
  for (const key of await listAllJobKeys()) {
    const record = await getJob(key);
    if (record?.state !== 'scheduled') {
      continue;
    }
    const subscription = await getSubscription(record.endpoint);
    const scheduledTime = scheduledForMillis(record.scheduledFor, subscription?.metadata?.timezone);
    if (scheduledTime > currentTime) {
      continue;
    }
    if (isDailyNotificationKind(record.kind) && currentTime > scheduledTime + DAILY_NOTIFICATION_DELIVERY_WINDOW_MILLIS) {
      await setJob(key, {
        ...record,
        state: 'cancelled',
        updatedAt: timestamp,
        cancelledAt: timestamp,
        lastError: 'Missed configured notification window',
      });
      continue;
    }
    records.push({ key, record });
  }
  records.sort((a, b) => {
    const first = a.record.scheduledFor.localeCompare(b.record.scheduledFor);
    return first === 0 ? a.record.jobId.localeCompare(b.record.jobId) : first;
  });

  const selected = records.slice(0, limit);
  let sent = 0;
  let failed = 0;

  for (const { key, record } of selected) {
    const subscription = await getSubscription(record.endpoint);
    if (!subscription) {
      await setJob(key, {
        ...record,
        state: 'failed',
        attempts: (record.attempts ?? 0) + 1,
        updatedAt: timestamp,
        lastAttemptAt: timestamp,
        failedAt: timestamp,
        lastError: 'Push subscription not found',
      });
      failed += 1;
      continue;
    }

    try {
      const result = await sendPush(
        subscription,
        createPushPayload({
          title: record.metadata.title,
          body: defaultBody(record.kind),
          path: record.metadata.path,
        }),
      );
      if (!result.ok) {
        throw new Error(`Web Push sender returned status ${result.status ?? 'unknown'}`);
      }
      await setJob(key, {
        ...record,
        state: 'completed',
        attempts: (record.attempts ?? 0) + 1,
        updatedAt: timestamp,
        lastAttemptAt: timestamp,
        completedAt: timestamp,
        lastStatus: result.status,
        lastError: undefined,
      });
      sent += 1;
    } catch (error) {
      await setJob(key, {
        ...record,
        state: 'failed',
        attempts: (record.attempts ?? 0) + 1,
        updatedAt: timestamp,
        lastAttemptAt: timestamp,
        failedAt: timestamp,
        lastError: error instanceof Error ? error.message : 'Scheduled push delivery failed',
      });
      failed += 1;
    }
  }

  return { ok: true, attempted: selected.length, sent, failed, remainingDue: Math.max(records.length - selected.length, 0), durable: isRedisConfigured() };
}

async function listScheduledJobs(endpoint) {
  const keys = endpoint ? await listJobKeysForEndpoint(endpoint) : await listAllJobKeys();
  const records = [];
  for (const key of keys) {
    const record = await getJob(key);
    if (record && (!endpoint || record.endpoint === endpoint)) {
      records.push(record);
    }
  }
  return records.sort((a, b) => {
    const first = a.scheduledFor.localeCompare(b.scheduledFor);
    return first === 0 ? a.jobId.localeCompare(b.jobId) : first;
  });
}

function isAuthorizedCronRequest(req) {
  if (allowUnauthenticatedCron) {
    return true;
  }
  if (!cronSecret) {
    return false;
  }
  return req.headers.authorization === `Bearer ${cronSecret}` || req.query?.secret === cronSecret;
}

export default async function handler(req, res) {
  const action = Array.isArray(req.query?.action) ? req.query.action.at(-1) : req.query?.action;

  try {
    if (req.method === 'GET' && action === 'vapid-public-key') {
      return json(res, 200, { publicKey: vapidPublicKey });
    }

    if (req.method === 'PUT' && action === 'subscriptions') {
      return json(res, 200, await upsertSubscription(readBody(req)));
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
      return json(res, 200, await replaceScheduledJobs(body));
    }

    if ((req.method === 'POST' || req.method === 'GET') && action === 'cron') {
      if (!isAuthorizedCronRequest(req)) {
        return json(res, 401, { error: 'Cron request is not authorized' });
      }
      const limit = Number(req.query?.limit ?? 25);
      return json(res, 200, await sendDueScheduledNotifications({ limit: Number.isFinite(limit) ? limit : 25 }));
    }

    if (req.method === 'GET' && action === 'status') {
      const endpoint = typeof req.query?.endpoint === 'string' ? req.query.endpoint : undefined;
      const jobs = await listScheduledJobs(endpoint);
      return json(res, 200, {
        ok: true,
        durable: isRedisConfigured(),
        jobCount: jobs.length,
        jobs: jobs.slice(-50),
      });
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
