import { DEFAULT_NOTIFICATION_SCHEDULE_DAYS, type ScheduledNotificationJob } from './notificationPlanner';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type SyncScheduleInput = {
  endpoint: string | null | undefined;
  jobs: ScheduledNotificationJob[];
  apiBase?: string;
  fetcher?: Fetcher;
  now?: () => number;
  schemaVersion?: string;
  horizonDays?: number;
};

type BackendError = {
  error?: string;
};

type ScheduleSyncCache = {
  endpoint: string;
  schemaVersion: string;
  horizonDays: number;
  jobsHash: string;
  syncedAt: number;
};

const scheduleSyncStorageKey = 'checklist-alarm:notification-schedule-sync';
const defaultScheduleSyncSchemaVersion = 'push-schedule-v2';
const forcedSyncAfterMillis = 12 * 60 * 60 * 1000;

async function parseBackendError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as BackendError;
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

function orderedJobs(jobs: ScheduledNotificationJob[]) {
  return [...jobs].sort((a, b) => {
    const first = a.scheduledFor.localeCompare(b.scheduledFor);
    return first === 0 ? a.jobId.localeCompare(b.jobId) : first;
  });
}

function hashSchedule(jobs: ScheduledNotificationJob[]) {
  return JSON.stringify(orderedJobs(jobs));
}

function loadSyncCache(): ScheduleSyncCache | null {
  try {
    const stored = localStorage.getItem(scheduleSyncStorageKey);
    return stored ? (JSON.parse(stored) as ScheduleSyncCache) : null;
  } catch {
    return null;
  }
}

function saveSyncCache(cache: ScheduleSyncCache) {
  try {
    localStorage.setItem(scheduleSyncStorageKey, JSON.stringify(cache));
  } catch {
    // Best-effort cache only; failed writes must not block push scheduling.
  }
}

export function resetScheduleSyncCache() {
  try {
    localStorage.removeItem(scheduleSyncStorageKey);
  } catch {
    // Best-effort cache only.
  }
}

export async function syncUpcomingNotificationSchedule({
  endpoint,
  jobs,
  apiBase = '/api/push',
  fetcher = fetch,
  now = () => Date.now(),
  schemaVersion = defaultScheduleSyncSchemaVersion,
  horizonDays = DEFAULT_NOTIFICATION_SCHEDULE_DAYS,
}: SyncScheduleInput) {
  if (!endpoint) {
    return { ok: false, skipped: true, reason: 'missing endpoint' } as const;
  }

  const jobsHash = hashSchedule(jobs);
  const timestamp = now();
  const previous = loadSyncCache();
  const isUnchanged =
    previous?.endpoint === endpoint &&
    previous.schemaVersion === schemaVersion &&
    previous.horizonDays === horizonDays &&
    previous.jobsHash === jobsHash &&
    timestamp - previous.syncedAt < forcedSyncAfterMillis;

  if (isUnchanged) {
    return { ok: false, skipped: true, reason: 'schedule unchanged' } as const;
  }

  const response = await fetcher(`${apiBase}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, jobs: orderedJobs(jobs) }),
  });

  if (!response.ok) {
    throw new Error(await parseBackendError(response, 'Failed to sync notification schedule'));
  }

  const body = (await response.json()) as { ok: true; upserted: number; cancelled: number };
  saveSyncCache({ endpoint, schemaVersion, horizonDays, jobsHash, syncedAt: timestamp });
  return body;
}
