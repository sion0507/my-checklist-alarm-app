import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.KV_REST_API_URL = 'https://redis.example';
  process.env.KV_REST_API_TOKEN = 'redis-token';
  process.env.CRON_SECRET = 'cron-secret';
  process.env.PUSH_SENDER_ENABLED = 'true';
});

// @ts-expect-error Vercel route is authored as JavaScript.
import handler from '../api/push/[action].js';

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: (statusCode: number) => MockResponse;
  json: (body: unknown) => void;
};

function response(): MockResponse {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(statusCode: number) {
      res.statusCode = statusCode;
      return res;
    },
    json(body: unknown) {
      res.body = body;
    },
  };
  return res;
}

describe('Vercel push route Redis command usage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cron queries only the due sorted set when no jobs are due', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const command = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ result: command[0] === 'ZRANGEBYSCORE' ? [] : null }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = response();

    await handler({ method: 'POST', query: { action: 'cron' }, headers: { authorization: 'Bearer cron-secret' } }, res);

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const command = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(command).toEqual(['ZRANGEBYSCORE', 'push:due-jobs', '-inf', expect.any(Number), 'LIMIT', 0, 25]);
    expect(command[0]).not.toBe('SMEMBERS');
  });

  it('schedule writes jobs through the pipeline and registers due scores', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(init?.body as string);
      if (url.endsWith('/pipeline')) {
        return new Response(JSON.stringify(body.map(() => ({ result: 1 }))), { status: 200 });
      }
      if (body[0] === 'GET') {
        return new Response(JSON.stringify({ result: null }), { status: 200 });
      }
      if (body[0] === 'SMEMBERS') {
        return new Response(JSON.stringify({ result: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: null }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = response();

    await handler(
      {
        method: 'POST',
        query: { action: 'schedule' },
        headers: {},
        body: {
          endpoint: 'https://push.example/device-1',
          jobs: [
            {
              jobId: 'morning:2026-06-01',
              kind: 'morning',
              scheduledFor: '2026-06-01T08:00:00',
              metadata: { title: '아침 알림', path: '/?date=2026-06-01' },
            },
          ],
        },
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    const pipelineBodies = fetchMock.mock.calls
      .filter(([input]) => String(input).endsWith('/pipeline'))
      .map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(pipelineBodies.flat()).toContainEqual(['ZADD', 'push:due-jobs', expect.any(Number), expect.stringContaining('push:job:')]);
  });
});
