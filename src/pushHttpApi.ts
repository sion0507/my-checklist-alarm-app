import { createPushBackend, type PushPayload, type StoredPushSubscription } from './pushBackend';

type PushHttpApiOptions = {
  vapidPublicKey: string;
  sendPush?: (subscription: StoredPushSubscription, payload: PushPayload) => Promise<{ ok: boolean; status?: number }>;
  now?: () => Date;
  cronSecret?: string;
  allowUnauthenticatedCron?: boolean;
};

type JsonResponse = {
  status: number;
  body: unknown;
};

async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new Error('Valid JSON request body is required');
  }
}

function json(status: number, body: unknown): JsonResponse {
  return { status, body };
}

export function createPushHttpApi(options: PushHttpApiOptions) {
  const backend = createPushBackend(options);
  const isAuthorizedCronRequest = (request: Request) => {
    if (options.allowUnauthenticatedCron) {
      return true;
    }
    if (!options.cronSecret) {
      return false;
    }
    const url = new URL(request.url);
    return request.headers.get('authorization') === `Bearer ${options.cronSecret}` || url.searchParams.get('secret') === options.cronSecret;
  };

  return {
    backend,

    async handle(request: Request): Promise<JsonResponse> {
      const url = new URL(request.url);
      const action = url.pathname.split('/').filter(Boolean).at(-1);

      try {
        if (request.method === 'GET' && action === 'vapid-public-key') {
          return json(200, { publicKey: backend.getVapidPublicKey() });
        }

        if (request.method === 'PUT' && action === 'subscriptions') {
          const body = await readJson(request);
          const result = await backend.upsertSubscription(body as Parameters<typeof backend.upsertSubscription>[0]);
          return json(200, result);
        }

        if (request.method === 'POST' && action === 'test') {
          const body = await readJson(request);
          if (typeof body.endpoint !== 'string') {
            return json(400, { error: 'Push subscription endpoint is required' });
          }
          const result = await backend.sendTestNotification(body.endpoint);
          return json(200, result);
        }

        if (request.method === 'POST' && action === 'schedule') {
          const body = await readJson(request);
          if (typeof body.endpoint !== 'string' || !Array.isArray(body.jobs)) {
            return json(400, { error: 'Push subscription endpoint and jobs are required' });
          }
          const result = await backend.replaceScheduledJobs(body as Parameters<typeof backend.replaceScheduledJobs>[0]);
          return json(200, result);
        }

        if ((request.method === 'POST' || request.method === 'GET') && action === 'cron') {
          if (!isAuthorizedCronRequest(request)) {
            return json(401, { error: 'Cron request is not authorized' });
          }
          const result = await backend.sendDueScheduledNotifications();
          return json(200, result);
        }

        return json(404, { error: 'Push API route not found' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Push API request failed';
        if (message.includes('not configured')) {
          return json(503, { error: message });
        }
        if (message.includes('not found')) {
          return json(404, { error: message });
        }
        return json(400, { error: message });
      }
    },
  };
}
