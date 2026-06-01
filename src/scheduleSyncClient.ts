import type { ScheduledNotificationJob } from './notificationPlanner';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type SyncScheduleInput = {
  endpoint: string | null | undefined;
  jobs: ScheduledNotificationJob[];
  apiBase?: string;
  fetcher?: Fetcher;
};

type BackendError = {
  error?: string;
};

async function parseBackendError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as BackendError;
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export async function syncUpcomingNotificationSchedule({
  endpoint,
  jobs,
  apiBase = '/api/push',
  fetcher = fetch,
}: SyncScheduleInput) {
  if (!endpoint) {
    return { ok: false, skipped: true, reason: 'missing endpoint' } as const;
  }

  const response = await fetcher(`${apiBase}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, jobs }),
  });

  if (!response.ok) {
    throw new Error(await parseBackendError(response, 'Failed to sync notification schedule'));
  }

  return response.json() as Promise<{ ok: true; upserted: number; cancelled: number }>;
}
