import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTaskStoreForTests,
  completeTaskOccurrence,
  createTask,
  deleteTask,
  deleteTaskOccurrence,
  listTaskOccurrencesForDate,
  listTasks,
  moveTaskOccurrence,
  projectTasksForDate,
  updateTask,
} from './taskStore';

describe('taskStore', () => {
  beforeEach(async () => {
    await clearTaskStoreForTests();
  });

  it('persists structured tasks in IndexedDB across store calls', async () => {
    const task = await createTask({
      title: '약 먹기',
      date: '2026-05-31',
      time: '08:30',
      recurrence: 'none',
      memo: '아침 식사 후',
      notify: true,
    });

    await expect(listTasks()).resolves.toEqual([expect.objectContaining({ id: task.id, title: '약 먹기' })]);
  });

  it('updates, completes, and deletes tasks', async () => {
    const task = await createTask({
      title: '운동',
      date: '2026-05-31',
      time: '',
      recurrence: 'none',
      memo: '',
      notify: false,
    });

    await updateTask(task.id, { title: '저녁 운동', completed: true });
    expect(await listTasks()).toEqual([expect.objectContaining({ title: '저녁 운동', completed: true })]);

    await deleteTask(task.id);
    expect(await listTasks()).toEqual([]);
  });

  it('projects daily recurrence without generating future task records', async () => {
    const task = await createTask({
      title: '물 마시기',
      date: '2026-06-01',
      time: '',
      recurrence: 'daily',
      memo: '',
      notify: false,
    });

    expect(await listTaskOccurrencesForDate('2026-06-03')).toEqual([
      expect.objectContaining({ id: task.id, title: '물 마시기', date: '2026-06-03', occurrenceDate: '2026-06-03' }),
    ]);
    expect(await listTasks()).toHaveLength(1);
  });

  it('projects weekly and monthly recurrence on matching dates only', () => {
    const weekly = {
      id: 'weekly',
      title: '주간 회고',
      date: '2026-06-01',
      time: '',
      recurrence: 'weekly' as const,
      memo: '',
      notify: false,
      completed: false,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    };
    const monthly = {
      ...weekly,
      id: 'monthly',
      title: '월간 정산',
      date: '2026-06-15',
      recurrence: 'monthly' as const,
    };

    expect(projectTasksForDate([weekly, monthly], '2026-06-08').map((task) => task.id)).toEqual(['weekly']);
    expect(projectTasksForDate([weekly, monthly], '2026-07-15').map((task) => task.id)).toEqual(['monthly']);
    expect(projectTasksForDate([weekly, monthly], '2026-07-16')).toEqual([]);
  });

  it('stores per-date completed, deleted, and moved exceptions for recurring tasks', async () => {
    const task = await createTask({
      title: '스트레칭',
      date: '2026-06-01',
      time: '',
      recurrence: 'daily',
      memo: '',
      notify: false,
    });

    await completeTaskOccurrence(task.id, '2026-06-02', true);
    expect(await listTaskOccurrencesForDate('2026-06-02')).toEqual([expect.objectContaining({ completed: true })]);
    expect(await listTaskOccurrencesForDate('2026-06-03')).toEqual([expect.objectContaining({ completed: false })]);

    await deleteTaskOccurrence(task.id, '2026-06-03');
    expect(await listTaskOccurrencesForDate('2026-06-03')).toEqual([]);

    await moveTaskOccurrence(task.id, '2026-06-04', '2026-06-10');
    expect(await listTaskOccurrencesForDate('2026-06-04')).toEqual([]);
    expect(await listTaskOccurrencesForDate('2026-06-10')).toEqual([
      expect.objectContaining({ date: '2026-06-10', occurrenceDate: '2026-06-04' }),
      expect.objectContaining({ date: '2026-06-10', occurrenceDate: '2026-06-10' }),
    ]);
  });
});
