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
  state: 'scheduled' | 'cancelled' | 'completed';
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
};

type ScheduledNotificationInput = Pick<ScheduledNotificationRecord, 'jobId' | 'kind' | 'scheduledFor' | 'metadata'> & {
  [ignoredLocalData: string]: unknown;
};

type SendPushResult = {
  ok: boolean;
  status?: number;
};

type SendPush = (subscription: StoredPushSubscription, payload: PushPayload) => Promise<SendPushResult>;

type PushBackendOptions = {
  vapidPublicKey: string;
  sendPush?: SendPush;
  now?: () => Date;
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

export function createPushPayload(payload: PushPayload): PushPayload {
  return {
    title: payload.title,
    body: payload.body,
    path: payload.path,
  };
}

export function createPushBackend({ vapidPublicKey, sendPush, now = () => new Date() }: PushBackendOptions) {
  const subscriptions = new Map<string, StoredPushSubscription>();
  const scheduledJobs = new Map<string, ScheduledNotificationRecord>();

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

      for (const record of scheduledJobs.values()) {
        if (record.endpoint === endpoint && record.state === 'scheduled' && !incomingIds.has(record.jobId)) {
          scheduledJobs.set(`${endpoint}:${record.jobId}`, {
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
    },

    listScheduledJobs(endpoint: string) {
      return [...scheduledJobs.values()]
        .filter((record) => record.endpoint === endpoint)
        .sort((a, b) => {
          const first = a.scheduledFor.localeCompare(b.scheduledFor);
          return first === 0 ? a.jobId.localeCompare(b.jobId) : first;
        });
    },
  };
}
