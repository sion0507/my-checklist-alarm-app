import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTaskStoreForTests,
  createTask,
  deleteTask,
  listTasks,
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
});
