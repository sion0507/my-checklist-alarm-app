import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { clearTaskStoreForTests, createTask, listTasks } from './taskStore';

describe('Morning check-in workflow', () => {
  beforeEach(async () => {
    await clearTaskStoreForTests();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a daily check-in card with today task summary until dismissed for that date', async () => {
    await createTask({ title: '약 먹기', date: '2026-06-01', time: '09:00', recurrence: 'none', memo: '', notify: true });
    await createTask({ title: '운동', date: '2026-06-01', time: '', recurrence: 'none', memo: '', notify: false });
    const user = userEvent.setup();
    const { unmount } = render(<App initialCalendarDate={new Date('2026-06-01T07:30:00')} />);

    expect(await screen.findByRole('heading', { name: '아침 체크인' })).toBeInTheDocument();
    expect(await screen.findByText(/오늘 할 일\s*2\s*개를 확인해 보세요\./)).toBeInTheDocument();
    const summary = screen.getByRole('list', { name: '아침 체크인 오늘 할 일 요약' });
    expect(within(summary).getByText(/약 먹기/)).toBeInTheDocument();
    expect(within(summary).getByText(/운동/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '오늘 체크인 완료' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: '아침 체크인' })).not.toBeInTheDocument());

    unmount();
    render(<App initialCalendarDate={new Date('2026-06-01T07:30:00')} />);
    expect(screen.queryByRole('heading', { name: '아침 체크인' })).not.toBeInTheDocument();

    vi.setSystemTime(new Date('2026-06-02T07:30:00'));
    unmount();
    render(<App initialCalendarDate={new Date('2026-06-02T07:30:00')} />);
    expect(await screen.findByRole('heading', { name: '아침 체크인' })).toBeInTheDocument();
  });

  it('quick-adds a today task from the morning card', async () => {
    const user = userEvent.setup();
    render(<App initialCalendarDate={new Date('2026-06-01T07:30:00')} />);

    await user.type(await screen.findByLabelText('아침 체크인 빠른 추가'), '물 마시기');
    await user.click(screen.getByRole('button', { name: '체크인에서 추가' }));

    const taskItems = await screen.findAllByTestId('today-task-item');
    expect(taskItems).toHaveLength(1);
    expect(taskItems[0]).toHaveTextContent('물 마시기');
    await waitFor(async () => {
      expect(await listTasks()).toEqual([expect.objectContaining({ title: '물 마시기', date: '2026-06-01' })]);
    });
  });
});
