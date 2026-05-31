import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { clearTaskStoreForTests, createTask, getTodayDateString, listTasks } from './taskStore';

describe('Today local task workflow', () => {
  beforeEach(async () => {
    await clearTaskStoreForTests();
  });

  it('quick-add creates a task for today and persists it after remount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.type(screen.getByLabelText('오늘 할 일 빠른 추가'), '병원 예약');
    await user.click(screen.getByRole('button', { name: '추가' }));

    expect(await screen.findByText('병원 예약')).toBeInTheDocument();
    const [stored] = await listTasks();
    expect(stored).toMatchObject({ title: '병원 예약', completed: false });

    unmount();
    render(<App />);
    expect(await screen.findByText('병원 예약')).toBeInTheDocument();
  });

  it('opens detail modal to edit all task fields', async () => {
    const user = userEvent.setup();
    const task = await createTask({
      title: '초기 제목',
      date: getTodayDateString(),
      time: '',
      recurrence: 'none',
      memo: '',
      notify: false,
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /초기 제목 상세 편집/ }));
    await user.clear(screen.getByLabelText('제목'));
    await user.type(screen.getByLabelText('제목'), '수정된 제목');
    await user.clear(screen.getByLabelText('날짜'));
    await user.type(screen.getByLabelText('날짜'), '2026-06-01');
    await user.type(screen.getByLabelText('시간'), '09:15');
    await user.selectOptions(screen.getByLabelText('반복'), 'weekly');
    await user.type(screen.getByLabelText('메모'), '메모 내용');
    await user.click(screen.getByLabelText('알림 켜기'));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(async () => {
      expect(await listTasks()).toEqual([
        expect.objectContaining({
          id: task.id,
          title: '수정된 제목',
          date: '2026-06-01',
          time: '09:15',
          recurrence: 'weekly',
          memo: '메모 내용',
          notify: true,
        }),
      ]);
    });
  });

  it('completes, orders incomplete tasks first, and deletes tasks', async () => {
    const user = userEvent.setup();
    await createTask({ title: '완료할 일', date: getTodayDateString(), time: '', recurrence: 'none', memo: '', notify: false });
    await createTask({ title: '남은 일', date: getTodayDateString(), time: '', recurrence: 'none', memo: '', notify: false });
    render(<App />);

    await user.click(await screen.findByRole('checkbox', { name: '완료할 일 완료' }));

    const taskItems = await screen.findAllByTestId('today-task-item');
    expect(taskItems.map((item) => item.textContent)).toEqual([expect.stringContaining('남은 일'), expect.stringContaining('완료할 일')]);
    expect(taskItems[1]).toHaveClass('completed');

    await user.click(screen.getByRole('button', { name: '완료할 일 삭제' }));
    await waitFor(() => expect(screen.queryByText('완료할 일')).not.toBeInTheDocument());
    expect(await listTasks()).toHaveLength(1);
  });
});
