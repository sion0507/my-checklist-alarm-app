import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { clearTaskStoreForTests, createTask, listTasks } from '../src/taskStore';

function openTaskNotificationEntry(taskId: string, date = '2026-06-03') {
  window.history.pushState({}, '', `/?date=${date}&taskId=${taskId}&occurrenceDate=${date}&entry=notification`);
}

describe('MVP workflow E2E coverage', () => {
  beforeEach(async () => {
    await clearTaskStoreForTests();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.unstubAllGlobals();
  });

  it('adds, edits, completes, and persists a Today task after reload/remount', async () => {
    const user = userEvent.setup();
    const firstRender = render(<App initialCalendarDate={new Date('2026-06-01T09:00:00')} />);

    await user.type(screen.getByLabelText('오늘 할 일 빠른 추가'), '초안 할 일');
    await user.click(screen.getByRole('button', { name: '추가' }));
    await user.click(await screen.findByRole('button', { name: /초안 할 일 상세 편집/ }));
    await user.clear(screen.getByLabelText('제목'));
    await user.type(screen.getByLabelText('제목'), '수정된 할 일');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await user.click(await screen.findByRole('checkbox', { name: '수정된 할 일 완료' }));

    await waitFor(async () => {
      expect(await listTasks()).toEqual([expect.objectContaining({ title: '수정된 할 일', completed: true })]);
    });

    firstRender.unmount();
    render(<App initialCalendarDate={new Date('2026-06-01T09:00:00')} />);

    const persistedTask = await screen.findByTestId('today-task-item');
    expect(persistedTask).toHaveTextContent('수정된 할 일');
    expect(persistedTask).toHaveClass('completed');
  });

  it('creates a task from the Calendar selected-date flow and persists it to the task store', async () => {
    render(<App initialCalendarDate={new Date(2026, 5, 1)} />);

    fireEvent.click(screen.getByRole('tab', { name: /캘린더/ }));
    fireEvent.click(screen.getByRole('button', { name: /2026-06-12/ }));
    const dialog = await screen.findByRole('dialog', { name: '2026-06-12 일정' });
    fireEvent.change(within(dialog).getByLabelText('선택한 날짜에 할 일 추가'), { target: { value: '캘린더 생성 할 일' } });
    fireEvent.submit(within(dialog).getByRole('button', { name: '날짜에 추가' }).closest('form')!);

    expect(await within(dialog).findByText('캘린더 생성 할 일')).toBeInTheDocument();
    await waitFor(async () => {
      expect(await listTasks()).toEqual([expect.objectContaining({ title: '캘린더 생성 할 일', date: '2026-06-12' })]);
    });
  });

  it('opens evening review from notification entry and keeps the review date scoped to the URL date', async () => {
    await createTask({ title: '리뷰할 알림 할 일', date: '2026-06-01', time: '', recurrence: 'none', memo: '', notify: false });
    await createTask({ title: '다른 날짜 할 일', date: '2026-06-02', time: '', recurrence: 'none', memo: '', notify: false });
    window.history.pushState({}, '', '/?date=2026-06-01&entry=evening');

    render(<App initialCalendarDate={new Date('2026-06-02T16:00:00')} />);

    const card = await screen.findByRole('region', { name: '저녁 미완료 리뷰' });
    expect(await within(card).findByText('리뷰할 알림 할 일')).toBeInTheDocument();
    expect(within(card).queryByText('다른 날짜 할 일')).not.toBeInTheDocument();
  });

  it('routes task notification entries to the target date and exposes quick actions', async () => {
    const task = await createTask({
      title: '알림 진입 할 일',
      date: '2026-06-03',
      time: '09:30',
      recurrence: 'none',
      memo: '',
      notify: true,
    });
    openTaskNotificationEntry(task.id);

    render(<App initialCalendarDate={new Date('2026-06-01T12:00:00')} />);

    expect(await screen.findByRole('button', { name: /^2026-06-03/ })).toHaveClass('selected');
    const entry = screen.getByRole('region', { name: '알림에서 열린 할 일' });
    expect(await within(entry).findByText('09:30 알림 진입 할 일')).toBeInTheDocument();
    expect(within(entry).getByRole('button', { name: '알림 진입 할 일 완료' })).toBeInTheDocument();
  });
});
