export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export type TaskException = {
  completed?: boolean;
  deleted?: boolean;
  movedTo?: string;
};

export type TaskExceptionMap = Record<string, TaskException>;

export type Task = {
  id: string;
  title: string;
  date: string;
  time: string;
  recurrence: Recurrence;
  exceptions?: TaskExceptionMap;
  memo: string;
  notify: boolean;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TaskOccurrence = Task & {
  occurrenceDate: string;
  sourceDate: string;
  isRecurringOccurrence: boolean;
};

export type TaskInput = {
  title: string;
  date: string;
  time: string;
  recurrence: Recurrence;
  memo: string;
  notify: boolean;
};

const DB_NAME = 'checklist-alarm-db';
const DB_VERSION = 1;
const TASK_STORE = 'tasks';

let dbPromise: Promise<IDBDatabase> | undefined;

export function getTodayDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function openDatabase() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(TASK_STORE)) {
          db.createObjectStore(TASK_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withTaskStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDatabase();
  const transaction = db.transaction(TASK_STORE, mode);
  const request = callback(transaction.objectStore(TASK_STORE));
  return requestToPromise(request);
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function createTask(input: TaskInput) {
  const now = new Date().toISOString();
  const task: Task = {
    ...input,
    title: input.title.trim(),
    id: createId(),
    completed: false,
    createdAt: now,
    updatedAt: now,
  };

  await withTaskStore('readwrite', (store) => store.put(task));
  return task;
}

export async function listTasks() {
  const tasks = await withTaskStore<Task[]>('readonly', (store) => store.getAll());
  return tasks.sort((a, b) => {
    const first = a.createdAt.localeCompare(b.createdAt);
    return first === 0 ? a.id.localeCompare(b.id) : first;
  });
}

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dayDifference(from: string, to: string) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / millisecondsPerDay);
}

export function taskOccursOnDate(task: Task, date: string) {
  if (task.recurrence === 'none') {
    return task.date === date;
  }

  const difference = dayDifference(task.date, date);
  if (difference < 0) {
    return false;
  }

  if (task.recurrence === 'daily') {
    return true;
  }

  if (task.recurrence === 'weekly') {
    return difference % 7 === 0;
  }

  const start = parseLocalDate(task.date);
  const target = parseLocalDate(date);
  return target.getDate() === start.getDate();
}

function toOccurrence(task: Task, occurrenceDate: string, projectedDate: string, exception?: TaskException): TaskOccurrence {
  return {
    ...task,
    completed: task.recurrence === 'none' ? task.completed : (exception?.completed ?? false),
    date: projectedDate,
    occurrenceDate,
    sourceDate: task.date,
    isRecurringOccurrence: task.recurrence !== 'none',
  };
}

export function projectTasksForDate(tasks: Task[], date: string) {
  const occurrences: TaskOccurrence[] = [];

  for (const task of tasks) {
    if (task.recurrence === 'none') {
      if (task.date === date) {
        occurrences.push(toOccurrence(task, task.date, task.date));
      }
      continue;
    }

    const exceptions = task.exceptions ?? {};

    if (taskOccursOnDate(task, date)) {
      const exception = exceptions[date];
      if (!exception?.deleted && !exception?.movedTo) {
        occurrences.push(toOccurrence(task, date, date, exception));
      }
    }

    for (const [occurrenceDate, exception] of Object.entries(exceptions)) {
      if (exception.movedTo === date && occurrenceDate !== date && !exception.deleted) {
        occurrences.push(toOccurrence(task, occurrenceDate, date, exception));
      }
    }
  }

  return occurrences.sort((a, b) => {
    const first = a.createdAt.localeCompare(b.createdAt);
    return first === 0 ? `${a.id}:${a.occurrenceDate}`.localeCompare(`${b.id}:${b.occurrenceDate}`) : first;
  });
}

export async function listTaskOccurrencesForDate(date: string) {
  return projectTasksForDate(await listTasks(), date);
}

export async function updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) {
  const existing = await withTaskStore<Task | undefined>('readonly', (store) => store.get(id));
  if (!existing) {
    throw new Error(`Task not found: ${id}`);
  }

  const updated: Task = {
    ...existing,
    ...updates,
    title: updates.title?.trim() ?? existing.title,
    updatedAt: new Date().toISOString(),
  };

  await withTaskStore('readwrite', (store) => store.put(updated));
  return updated;
}

async function updateTaskException(id: string, occurrenceDate: string, updates: TaskException) {
  const existing = await withTaskStore<Task | undefined>('readonly', (store) => store.get(id));
  if (!existing) {
    throw new Error(`Task not found: ${id}`);
  }

  if (existing.recurrence === 'none') {
    throw new Error(`Task is not recurring: ${id}`);
  }

  const currentException = existing.exceptions?.[occurrenceDate] ?? {};
  const updated: Task = {
    ...existing,
    exceptions: {
      ...(existing.exceptions ?? {}),
      [occurrenceDate]: {
        ...currentException,
        ...updates,
      },
    },
    updatedAt: new Date().toISOString(),
  };

  await withTaskStore('readwrite', (store) => store.put(updated));
  return updated;
}

export async function completeTaskOccurrence(id: string, occurrenceDate: string, completed: boolean) {
  return updateTaskException(id, occurrenceDate, { completed });
}

export async function deleteTaskOccurrence(id: string, occurrenceDate: string) {
  return updateTaskException(id, occurrenceDate, { deleted: true });
}

export async function moveTaskOccurrence(id: string, occurrenceDate: string, movedTo: string) {
  return updateTaskException(id, occurrenceDate, { movedTo });
}

export async function deleteTask(id: string) {
  await withTaskStore('readwrite', (store) => store.delete(id));
}

export async function clearTaskStoreForTests() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = undefined;
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Task store deletion blocked'));
  });
}
