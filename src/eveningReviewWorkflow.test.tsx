import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { clearTaskStoreForTests, createTask, listTasks, updateTask } from './taskStore';

describe('Evening unfinished-task review workflow', () => {
  beforeEach(async () => {
    await clearTaskStoreForTests();
    localStorage.clear();
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('does not show the evening review before the configured evening window', async () => {
    await createTask({ title: '아직 리뷰 전', date: '2026-06-01', time: '', recurrence: 'none', memo: '', notify: false });

    render(<App initialCalendarDate={new Date('2026-06-01T22:59:00')} />);

    expect(await screen.findByRole('checkbox', { name: '아직 리뷰 전 완료' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '저녁 미완료 리뷰' })).not.toBeInTheDocument();
  });

  it('shows unfinished tasks daily and a completion message after the evening window when there are no unfinished tasks', async () => {
    await createTask({ title: '완료한 일', date: '2026-06-01', time: '', recurrence: 'none', memo: '', notify: false });
    const [task] = await listTasks();
    await updateTask(task.id, { completed: true });

    render(<App initialCalendarDate={new Date('2026-06-01T23:00:00')} />);

    const card = await screen.findByRole('region', { name: '저녁 미완료 리뷰' });
    expect(within(card).getByRole('heading', { name: '저녁 리뷰' })).toBeInTheDocument();
    expect(within(card).getByText('오늘 미완료 할 일이 없습니다. 편안한 저녁 보내세요.')).toBeInTheDocument();
  });

  it('uses custom evening reminder time for the review window', async () => {
    await createTask({ title: '커스텀 리뷰', date: '2026-06-01', time: '', recurrence: 'none', memo: '', notify: false });
    localStorage.setItem('checklist-alarm:reminder-settings', JSON.stringify({ morningTime: '08:00', eveningTime: '20:30' }));

    const before = render(<App initialCalendarDate={new Date('2026-06-01T20:29:00')} />);
    expect(await screen.findByRole('checkbox', { name: '커스텀 리뷰 완료' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '저녁 미완료 리뷰' })).not.toBeInTheDocument();
    before.unmount();

    render(<App initialCalendarDate={new Date('2026-06-01T20:30:00')} />);

    const card = await screen.findByRole('region', { name: '저녁 미완료 리뷰' });
    expect(await within(card).findByText('커스텀 리뷰')).toBeInTheDocument();
  });

  it('lets a user leave an unfinished task as-is for the day', async () => {
    await createTask({ title: '내일 계속하기', date: '2026-06-01', time: '', recurrence: 'none', memo: '', notify: false });
    const user = userEvent.setup();

    render(<App initialCalendarDate={new Date('2026-06-01T23:05:00')} />);

    const card = await screen.findByRole('region', { name: '저녁 미완료 리뷰' });
    await user.click(await within(card).findByRole('button', { name: '내일 계속하기 그대로 두기' }));

    await waitFor(() => expect(within(card).queryByText('내일 계속하기')).not.toBeInTheDocument());
    expect(within(card).getByText('오늘 저녁 리뷰가 완료되었습니다. 남긴 할 일은 그대로 유지됩니다.')).toBeInTheDocument();
    expect(await listTasks()).toEqual([expect.objectContaining({ title: '내일 계속하기', date: '2026-06-01', completed: false })]);
  });

  it('deletes and moves unfinished tasks from the evening review and resyncs schedules', async () => {
    await createTask({ title: '삭제할 일', date: '2026-06-01', time: '', recurrence: 'none', memo: '', notify: false });
    await createTask({ title: '옮길 일', date: '2026-06-01', time: '', recurrence: 'none', memo: '', notify: false });
    localStorage.setItem('checklist-alarm:push-subscription-endpoint', 'https://push.example/device-1');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, upserted: 14, cancelled: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<App initialCalendarDate={new Date('2026-06-01T23:05:00')} />);

    const card = await screen.findByRole('region', { name: '저녁 미완료 리뷰' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/push/schedule', expect.any(Object)));
    await user.click(await within(card).findByRole('button', { name: '삭제할 일 삭제' }));
    fireEvent.change(await within(card).findByLabelText('옮길 일 이동할 날짜'), { target: { value: '2026-06-03' } });
    await user.click(within(card).getByRole('button', { name: '옮길 일 이동' }));

    await waitFor(async () => {
      expect(await listTasks()).toEqual([expect.objectContaining({ title: '옮길 일', date: '2026-06-03' })]);
    });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3));
    const latestCall = fetchMock.mock.calls.at(-1) as unknown as [RequestInfo | URL, RequestInit];
    const latestBody = JSON.parse(latestCall[1].body as string);
    expect(latestBody.jobs).not.toContainEqual(expect.objectContaining({ jobId: 'evening:2026-06-01' }));
    expect(latestBody.jobs).toContainEqual(expect.objectContaining({ jobId: 'evening:2026-06-03', scheduledFor: '2026-06-03T23:00:00' }));
  });
});
