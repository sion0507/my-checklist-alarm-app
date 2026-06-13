export type PushKeys = {
  p256dh: string;
  auth: string;
};

export type MinimalPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: PushKeys;
};

export type NotificationMetadata = {
  timezone?: string;
  userAgent?: string;
  morningTime?: string;
  eveningTime?: string;
};

export type StoredPushSubscription = MinimalPushSubscription & {
  metadata: NotificationMetadata;
  createdAt: string;
  updatedAt: string;
};

export type PushPayload = {
  title: string;
  body: string;
  path: string;
};

export type ScheduledNotificationRecord = {
  endpoint: string;
  jobId: string;
  kind: 'morning' | 'evening' | 'task';
  scheduledFor: string;
  metadata: {
    title: string;
    path: string;
    taskId?: string;
    occurrenceDate?: string;
  };
  state: 'scheduled' | 'cancelled' | 'completed' | 'failed';
  attempts: number;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  lastAttemptAt?: string;
  completedAt?: string;
  failedAt?: string;
  lastStatus?: number;
  lastError?: string;
};

type ScheduledNotificationInput = Pick<ScheduledNotificationRecord, 'jobId' | 'kind' | 'scheduledFor' | 'metadata'> & {
  [ignoredLocalData: string]: unknown;
};

type SendPushResult = {
  ok: boolean;
  status?: number;
};

type SendPush = (subscription: StoredPushSubscription, payload: PushPayload) => Promise<SendPushResult>;

export type PushStore = {
  subscriptions: Map<string, StoredPushSubscription>;
  scheduledJobs: Map<string, ScheduledNotificationRecord>;
  dueJobScores: Map<string, number>;
  dueIndexReads: number;
  fullJobScans: number;
};

type PushBackendOptions = {
  vapidPublicKey: string;
  sendPush?: SendPush;
  now?: () => Date;
  store?: PushStore;
};

type UpsertSubscriptionInput = {
  subscription: MinimalPushSubscription;
  metadata?: NotificationMetadata;
  [ignoredLocalData: string]: unknown;
};

function validateSubscription(subscription: MinimalPushSubscription) {
  if (!subscription.endpoint) {
    throw new Error('Push subscription endpoint is required');
  }
  if (!subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error('Push subscription keys are required');
  }
}

function scheduledJobKey(endpoint: string, jobId: string) {
  return `${endpoint}:${jobId}`;
}

function defaultBody(kind: ScheduledNotificationRecord['kind']) {
  if (kind === 'morning') {
    return '오늘 체크리스트를 확인해 주세요.';
  }
  if (kind === 'evening') {
    return '오늘 남은 할 일을 리뷰해 주세요.';
  }
  return '예약된 할 일 시간입니다.';
}

const DAILY_NOTIFICATION_DELIVERY_WINDOW_MILLIS = 15 * 60 * 1000;

function isDailyNotificationKind(kind: ScheduledNotificationRecord['kind']) {
  return kind === 'morning' || kind === 'evening';
}

function getTimeZoneOffsetMillis(date: Date, timeZone: string) {
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

function scheduledForMillis(scheduledFor: string, timeZone?: string) {
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

export function createInMemoryPushStore(): PushStore {
  return {
    subscriptions: new Map<string, StoredPushSubscription>(),
    scheduledJobs: new Map<string, ScheduledNotificationRecord>(),
    dueJobScores: new Map<string, number>(),
    dueIndexReads: 0,
    fullJobScans: 0,
  };
}

export function createPushPayload(payload: PushPayload): PushPayload {
  return {
    title: payload.title,
    body: payload.body,
    path: payload.path,
  };
}

export function createPushBackend({ vapidPublicKey, sendPush, now = () => new Date(), store = createInMemoryPushStore() }: PushBackendOptions) {
  const { subscriptions, scheduledJobs, dueJobScores } = store;

  function saveScheduledJob(record: ScheduledNotificationRecord) {
    const key = scheduledJobKey(record.endpoint, record.jobId);
    scheduledJobs.set(key, record);
    const timezone = subscriptions.get(record.endpoint)?.metadata.timezone;
    dueJobScores.set(key, scheduledForMillis(record.scheduledFor, timezone));
  }

  function deleteScheduledJob(endpoint: string, jobId: string) {
    const key = scheduledJobKey(endpoint, jobId);
    scheduledJobs.delete(key);
    dueJobScores.delete(key);
  }

  function listDueScheduledJobs(currentTime: number) {
    store.dueIndexReads += 1;
    return [...dueJobScores.entries()]
      .filter(([, score]) => score <= currentTime)
      .map(([key]) => scheduledJobs.get(key))
      .filter((record): record is ScheduledNotificationRecord => Boolean(record))
      .sort((a, b) => {
        const first = a.scheduledFor.localeCompare(b.scheduledFor);
        return first === 0 ? a.jobId.localeCompare(b.jobId) : first;
      });
  }

  return {
    getVapidPublicKey() {
      return vapidPublicKey;
    },

    async upsertSubscription({ subscription, metadata = {} }: UpsertSubscriptionInput) {
      validateSubscription(subscription);
      const previous = subscriptions.get(subscription.endpoint);
      const timestamp = now().toISOString();
      const stored: StoredPushSubscription = {
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
    },

    getSubscription(endpoint: string) {
      return subscriptions.get(endpoint) ?? null;
    },

    async sendTestNotification(endpoint: string) {
      const subscription = subscriptions.get(endpoint);
      if (!subscription) {
        throw new Error('Push subscription not found');
      }
      if (!sendPush) {
        throw new Error('Web Push sender is not configured');
      }
      return sendPush(
        subscription,
        createPushPayload({
          title: 'Checklist Alarm 테스트',
          body: '백엔드 경유 테스트 알림입니다.',
          path: '/?source=test-push',
        }),
      );
    },

    async replaceScheduledJobs({ endpoint, jobs }: { endpoint: string; jobs: ScheduledNotificationInput[] }) {
      if (!endpoint) {
        throw new Error('Push subscription endpoint is required');
      }

      const timestamp = now().toISOString();
      const incomingIds = new Set(jobs.map((job) => job.jobId));
      let cancelled = 0;

      store.fullJobScans += 1;
      for (const record of [...scheduledJobs.values()]) {
        if (record.endpoint === endpoint && record.state === 'scheduled' && !incomingIds.has(record.jobId)) {
          deleteScheduledJob(endpoint, record.jobId);
          cancelled += 1;
        }
      }

      for (const job of jobs) {
        const key = scheduledJobKey(endpoint, job.jobId);
        const previous = scheduledJobs.get(key);
        saveScheduledJob({
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
          attempts: previous?.attempts ?? 0,
          createdAt: previous?.createdAt ?? timestamp,
          updatedAt: timestamp,
          lastAttemptAt: previous?.lastAttemptAt,
          completedAt: previous?.completedAt,
          lastStatus: previous?.lastStatus,
          lastError: previous?.lastError,
        });
      }

      return { ok: true, upserted: jobs.length, cancelled };
    },

    listScheduledJobs(endpoint: string) {
      return [...scheduledJobs.values()]
        .filter((record) => record.endpoint === endpoint)
        .sort((a, b) => {
          const first = a.scheduledFor.localeCompare(b.scheduledFor);
          return first === 0 ? a.jobId.localeCompare(b.jobId) : first;
        });
    },

    async sendDueScheduledNotifications({ limit = 25 }: { limit?: number } = {}) {
      if (!sendPush) {
        throw new Error('Web Push sender is not configured');
      }

      const currentDate = now();
      const timestamp = currentDate.toISOString();
      const currentTime = currentDate.getTime();
      const dueJobs: ScheduledNotificationRecord[] = [];
      for (const record of listDueScheduledJobs(currentTime)) {
        if (record.state !== 'scheduled') {
          continue;
        }
        const timezone = subscriptions.get(record.endpoint)?.metadata.timezone;
        const scheduledTime = scheduledForMillis(record.scheduledFor, timezone);
        if (scheduledTime > currentTime) {
          continue;
        }
        if (isDailyNotificationKind(record.kind) && currentTime > scheduledTime + DAILY_NOTIFICATION_DELIVERY_WINDOW_MILLIS) {
          deleteScheduledJob(record.endpoint, record.jobId);
          continue;
        }
        dueJobs.push(record);
      }
      dueJobs.sort((a, b) => {
        const first = a.scheduledFor.localeCompare(b.scheduledFor);
        return first === 0 ? a.jobId.localeCompare(b.jobId) : first;
      });
      const selectedJobs = dueJobs.slice(0, limit);
      let sent = 0;
      let failed = 0;

      for (const record of selectedJobs) {
        const key = scheduledJobKey(record.endpoint, record.jobId);
        const subscription = subscriptions.get(record.endpoint);
        if (!subscription) {
          deleteScheduledJob(record.endpoint, record.jobId);
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
          deleteScheduledJob(record.endpoint, record.jobId);
          sent += 1;
        } catch (error) {
          deleteScheduledJob(record.endpoint, record.jobId);
          failed += 1;
        }
      }

      return {
        ok: true,
        attempted: selectedJobs.length,
        sent,
        failed,
        remainingDue: Math.max(dueJobs.length - selectedJobs.length, 0),
      };
    },
  };
}
