import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { clearTaskStoreForTests, createTask, listTasks } from './taskStore';

function openNotificationEntryUrl(taskId: string, date = '2026-06-03') {
  window.history.pushState({}, '', `/?date=${date}&taskId=${taskId}&occurrenceDate=${date}&entry=notification`);
}

describe('Notification task entry workflow', () => {
  beforeEach(async () => {
    await clearTaskStoreForTests();
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('routes from a task notification into the task date and highlights the related task', async () => {
    const task = await createTask({
      title: '약 먹기',
      date: '2026-06-03',
      time: '09:30',
      recurrence: 'none',
      memo: '',
      notify: true,
    });
    openNotificationEntryUrl(task.id);

    render(<App initialCalendarDate={new Date('2026-06-01T12:00:00')} />);

    expect(await screen.findByRole('heading', { name: 'June 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026-06-03' })).toHaveClass('selected');
    const entry = screen.getByRole('region', { name: '알림에서 열린 할 일' });
    expect(await within(entry).findByText('09:30 약 먹기')).toBeInTheDocument();
    expect(within(entry).getByRole('button', { name: '약 먹기 완료' })).toBeInTheDocument();
    expect(within(entry).getByRole('button', { name: '약 먹기 삭제' })).toBeInTheDocument();
    expect(within(entry).getByLabelText('약 먹기 이동할 날짜')).toHaveValue('2026-06-03');
    expect(await screen.findByRole('button', { name: '약 먹기 상세 열기' })).toHaveClass('notification-highlight');
  });

  it('completes the notification task from quick actions', async () => {
    const user = userEvent.setup();
    const task = await createTask({
      title: '운동 가기',
      date: '2026-06-03',
      time: '07:00',
      recurrence: 'none',
      memo: '',
      notify: true,
    });
    openNotificationEntryUrl(task.id);

    render(<App initialCalendarDate={new Date('2026-06-01T12:00:00')} />);

    await user.click(await screen.findByRole('button', { name: '운동 가기 완료' }, { timeout: 5000 }));

    await waitFor(async () => {
      expect(await listTasks()).toEqual([expect.objectContaining({ id: task.id, completed: true })]);
    });
    expect(screen.getByRole('status')).toHaveTextContent('운동 가기 완료 처리했습니다.');
  });

  it('moves the notification task from quick actions', async () => {
    const user = userEvent.setup();
    const task = await createTask({
      title: '치과 예약',
      date: '2026-06-03',
      time: '15:00',
      recurrence: 'none',
      memo: '',
      notify: true,
    });
    openNotificationEntryUrl(task.id);

    render(<App initialCalendarDate={new Date('2026-06-01T12:00:00')} />);

    fireEvent.change(await screen.findByLabelText('치과 예약 이동할 날짜', undefined, { timeout: 5000 }), { target: { value: '2026-06-05' } });
    await user.click(screen.getByRole('button', { name: '치과 예약 이동' }));

    await waitFor(async () => {
      expect(await listTasks()).toEqual([expect.objectContaining({ id: task.id, date: '2026-06-05' })]);
    });
    expect(screen.getByRole('button', { name: '2026-06-05' })).toHaveClass('selected');
    expect(await screen.findByRole('button', { name: '치과 예약 상세 열기' })).toHaveClass('notification-highlight');
    expect(screen.getByRole('status')).toHaveTextContent('치과 예약 2026-06-05로 이동했습니다.');
  });

  it('deletes the notification task from quick actions', async () => {
    const user = userEvent.setup();
    const task = await createTask({
      title: '회의 준비',
      date: '2026-06-03',
      time: '10:00',
      recurrence: 'none',
      memo: '',
      notify: true,
    });
    openNotificationEntryUrl(task.id);

    render(<App initialCalendarDate={new Date('2026-06-01T12:00:00')} />);

    await user.click(await screen.findByRole('button', { name: '회의 준비 삭제' }, { timeout: 5000 }));

    await waitFor(async () => {
      expect(await listTasks()).toEqual([]);
    });
    expect(screen.getByRole('status')).toHaveTextContent('회의 준비 삭제했습니다.');
  });
});
