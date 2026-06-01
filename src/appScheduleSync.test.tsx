import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { clearTaskStoreForTests, createTask, getTodayDateString } from './taskStore';

describe('App notification schedule sync triggers', () => {
  beforeEach(async () => {
    await clearTaskStoreForTests();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('reconciles upcoming jobs on startup and after task completion changes', async () => {
    const today = getTodayDateString(new Date('2026-06-01T12:00:00'));
    await createTask({ title: '알림 켜진 일', date: today, time: '09:30', recurrence: 'none', memo: 'local memo', notify: true });
    localStorage.setItem('checklist-alarm:push-subscription-endpoint', 'https://push.example/device-1');
    localStorage.setItem('checklist-alarm:reminder-settings', JSON.stringify({ morningTime: '08:00', eveningTime: '23:00' }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, upserted: 15, cancelled: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<App initialCalendarDate={new Date('2026-06-01T12:00:00')} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/push/schedule', expect.any(Object)));
    const startupCall = fetchMock.mock.calls.at(-1) as unknown as [RequestInfo | URL, RequestInit];
    const startupBody = JSON.parse(startupCall[1].body as string);
    expect(startupBody.jobs.map((job: { jobId: string }) => job.jobId)).toContain(`task:${startupBody.jobs.find((job: { kind: string }) => job.kind === 'task').metadata.taskId}:${today}`);
    expect(JSON.stringify(startupBody)).not.toContain('local memo');

    await user.click(await screen.findByRole('checkbox', { name: '알림 켜진 일 완료' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const completionCall = fetchMock.mock.calls.at(-1) as unknown as [RequestInfo | URL, RequestInit];
    const completionBody = JSON.parse(completionCall[1].body as string);
    expect(completionBody.jobs.some((job: { kind: string }) => job.kind === 'task')).toBe(false);
  });
});
