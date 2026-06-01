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
  };
}
