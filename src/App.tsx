import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  completeTaskOccurrence,
  createTask,
  deleteTask,
  deleteTaskOccurrence,
  getTodayDateString,
  listTaskOccurrencesForDate,
  moveTaskOccurrence,
  Recurrence,
  Task,
  TaskOccurrence,
  updateTask,
} from './taskStore';

type TabId = 'today' | 'calendar' | 'settings';

type Tab = {
  id: TabId;
  label: string;
  title: string;
  eyebrow: string;
  description: string;
};

const tabs: Tab[] = [
  {
    id: 'today',
    label: '오늘',
    title: '오늘',
    eyebrow: 'Today',
    description: '오늘 해야 할 일을 가장 먼저 보여주는 기본 화면입니다.',
  },
  {
    id: 'calendar',
    label: '캘린더',
    title: '캘린더',
    eyebrow: 'Calendar',
    description: '월간 일정과 할 일 분포를 확인할 공간입니다.',
  },
  {
    id: 'settings',
    label: '설정',
    title: '설정',
    eyebrow: 'Settings',
    description: '아침/저녁 알림 시간과 PWA 알림 상태를 설정할 공간입니다.',
  },
];

const tabIcons: Record<TabId, string> = {
  today: '✓',
  calendar: '▦',
  settings: '⚙',
};

const recurrenceLabels: Record<Recurrence, string> = {
  none: '반복 없음',
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
};

function sortIncompleteFirst<T extends Task>(tasks: T[]) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    const first = a.createdAt.localeCompare(b.createdAt);
    return first === 0 ? a.id.localeCompare(b.id) : first;
  });
}

function emptyTaskForm(): TaskFormState {
  return {
    title: '',
    date: getTodayDateString(),
    time: '',
    recurrence: 'none',
    memo: '',
    notify: false,
  };
}

type TaskFormState = {
  title: string;
  date: string;
  time: string;
  recurrence: Recurrence;
  memo: string;
  notify: boolean;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [tasks, setTasks] = useState<TaskOccurrence[]>([]);
  const [quickTitle, setQuickTitle] = useState('');
  const [editingTask, setEditingTask] = useState<TaskOccurrence | null>(null);
  const [form, setForm] = useState<TaskFormState>(emptyTaskForm);
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  async function refreshTasks() {
    setTasks(await listTaskOccurrencesForDate(getTodayDateString()));
  }

  useEffect(() => {
    void refreshTasks();
  }, []);

  const todayTasks = useMemo(() => sortIncompleteFirst(tasks), [tasks]);

  async function handleQuickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title) {
      return;
    }

    await createTask({
      title,
      date: getTodayDateString(),
      time: '',
      recurrence: 'none',
      memo: '',
      notify: false,
    });
    setQuickTitle('');
    await refreshTasks();
  }

  function openEditModal(task: TaskOccurrence) {
    setEditingTask(task);
    setForm({
      title: task.title,
      date: task.date,
      time: task.time,
      recurrence: task.recurrence,
      memo: task.memo,
      notify: task.notify,
    });
  }

  async function handleSaveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask || !form.title.trim() || !form.date) {
      return;
    }

    if (editingTask.isRecurringOccurrence) {
      if (form.date !== editingTask.date) {
        await moveTaskOccurrence(editingTask.id, editingTask.occurrenceDate, form.date);
      }
    } else {
      await updateTask(editingTask.id, form);
    }
    setEditingTask(null);
    await refreshTasks();
  }

  async function handleSaveRecurringRule() {
    if (!editingTask || !form.title.trim() || !form.date) {
      return;
    }

    await updateTask(editingTask.id, form);
    setEditingTask(null);
    await refreshTasks();
  }

  async function handleToggleComplete(task: TaskOccurrence) {
    if (task.isRecurringOccurrence) {
      await completeTaskOccurrence(task.id, task.occurrenceDate, !task.completed);
    } else {
      await updateTask(task.id, { completed: !task.completed });
    }
    await refreshTasks();
  }

  async function handleDeleteTask(task: TaskOccurrence) {
    if (task.isRecurringOccurrence) {
      await deleteTaskOccurrence(task.id, task.occurrenceDate);
    } else {
      await deleteTask(task.id);
    }
    if (editingTask?.id === task.id) {
      setEditingTask(null);
    }
    await refreshTasks();
  }

  async function handleDeleteRecurringRule(task: TaskOccurrence) {
    await deleteTask(task.id);
    if (editingTask?.id === task.id) {
      setEditingTask(null);
    }
    await refreshTasks();
  }

  return (
    <main className="app-shell" aria-label="Checklist Alarm PWA">
      <section className="phone-frame">
        <header className="app-header">
          <p className="app-kicker">Checklist Alarm</p>
          <h1>{active.title}</h1>
        </header>

        <section className="content-card" aria-label={`${active.title} 화면`}>
          <p className="content-eyebrow">{active.eyebrow}</p>
          <p className="panel-title" id={`${active.id}-panel`}>
            {active.title}
          </p>
          <p>{active.description}</p>
          {active.id === 'today' ? (
            <TodayPanel
              onDeleteTask={handleDeleteTask}
              onEditTask={openEditModal}
              onQuickAdd={handleQuickAdd}
              onQuickTitleChange={setQuickTitle}
              onToggleComplete={handleToggleComplete}
              quickTitle={quickTitle}
              tasks={todayTasks}
            />
          ) : null}
        </section>

        <nav className="bottom-tabs" aria-label="Primary" role="tablist">
          {tabs.map((tab) => (
            <button
              aria-controls={`${tab.id}-panel`}
              aria-selected={activeTab === tab.id}
              className="bottom-tab"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              <span aria-hidden="true" className="tab-icon">
                {tabIcons[tab.id]}
              </span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </section>

      {editingTask ? (
        <TaskDetailModal
          form={form}
          onClose={() => setEditingTask(null)}
          onDelete={() => void handleDeleteTask(editingTask)}
          onDeleteRecurringRule={() => void handleDeleteRecurringRule(editingTask)}
          onFormChange={setForm}
          onSave={handleSaveTask}
          onSaveRecurringRule={() => void handleSaveRecurringRule()}
          task={editingTask}
        />
      ) : null}
    </main>
  );
}

type TodayPanelProps = {
  tasks: TaskOccurrence[];
  quickTitle: string;
  onQuickTitleChange: (value: string) => void;
  onQuickAdd: (event: FormEvent<HTMLFormElement>) => void;
  onToggleComplete: (task: TaskOccurrence) => void;
  onEditTask: (task: TaskOccurrence) => void;
  onDeleteTask: (task: TaskOccurrence) => void;
};

function TodayPanel({
  tasks,
  quickTitle,
  onQuickTitleChange,
  onQuickAdd,
  onToggleComplete,
  onEditTask,
  onDeleteTask,
}: TodayPanelProps) {
  return (
    <div className="today-panel">
      <form className="quick-add" onSubmit={onQuickAdd}>
        <label htmlFor="quick-add-title">오늘 할 일 빠른 추가</label>
        <div className="quick-add-row">
          <input
            id="quick-add-title"
            onChange={(event) => onQuickTitleChange(event.target.value)}
            placeholder="예: 병원 예약"
            type="text"
            value={quickTitle}
          />
          <button type="submit">추가</button>
        </div>
      </form>

      {tasks.length === 0 ? (
        <div className="empty-state" role="status">
          아직 등록된 할 일이 없습니다. 빠른 추가로 오늘 할 일을 기록하세요.
        </div>
      ) : (
        <ul className="task-list" aria-label="오늘 할 일 목록">
          {tasks.map((task) => (
            <li className={`task-item ${task.completed ? 'completed' : ''}`} data-testid="today-task-item" key={task.id}>
              <label className="task-check">
                <input
                  checked={task.completed}
                  onChange={() => onToggleComplete(task)}
                  type="checkbox"
                  aria-label={`${task.title} 완료`}
                />
                <span>{task.title}</span>
              </label>
              <div className="task-meta">
                {task.time ? <span>{task.time}</span> : null}
                {task.recurrence !== 'none' ? <span>{recurrenceLabels[task.recurrence]}</span> : null}
                {task.notify ? <span>알림</span> : null}
              </div>
              <div className="task-actions">
                <button onClick={() => onEditTask(task)} type="button">
                  {task.title} 상세 편집
                </button>
                <button onClick={() => onDeleteTask(task)} type="button">
                  {task.title} 삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type TaskDetailModalProps = {
  task: TaskOccurrence;
  form: TaskFormState;
  onFormChange: (form: TaskFormState) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSaveRecurringRule: () => void;
  onDelete: () => void;
  onDeleteRecurringRule: () => void;
  onClose: () => void;
};

function TaskDetailModal({
  task,
  form,
  onFormChange,
  onSave,
  onSaveRecurringRule,
  onDelete,
  onDeleteRecurringRule,
  onClose,
}: TaskDetailModalProps) {
  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog" aria-label={`${task.title} 상세`}>
      <form className="task-modal" onSubmit={onSave}>
        <div className="modal-header">
          <h2>할 일 상세</h2>
          <button aria-label="닫기" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <label>
          제목
          <input
            required
            value={form.title}
            onChange={(event) => onFormChange({ ...form, title: event.target.value })}
          />
        </label>
        <label>
          날짜
          <input
            required
            type="date"
            value={form.date}
            onChange={(event) => onFormChange({ ...form, date: event.target.value })}
          />
        </label>
        <label>
          시간
          <input
            type="time"
            value={form.time}
            onChange={(event) => onFormChange({ ...form, time: event.target.value })}
          />
        </label>
        <label>
          반복
          <select
            value={form.recurrence}
            onChange={(event) => onFormChange({ ...form, recurrence: event.target.value as Recurrence })}
          >
            {Object.entries(recurrenceLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          메모
          <textarea value={form.memo} onChange={(event) => onFormChange({ ...form, memo: event.target.value })} />
        </label>
        <label className="checkbox-row">
          <input
            checked={form.notify}
            onChange={(event) => onFormChange({ ...form, notify: event.target.checked })}
            type="checkbox"
          />
          알림 켜기
        </label>
        {task.isRecurringOccurrence ? (
          <div className="recurrence-actions" aria-label="반복 규칙 작업">
            <p>이 반복 할 일의 기본 저장/삭제는 선택한 날짜({task.occurrenceDate})에만 적용됩니다.</p>
            <button onClick={onSaveRecurringRule} type="button">
              반복 규칙 전체 저장
            </button>
            <button className="danger-button" onClick={onDeleteRecurringRule} type="button">
              반복 규칙 전체 삭제
            </button>
          </div>
        ) : null}
        <div className="modal-actions">
          <button className="danger-button" onClick={onDelete} type="button">
            {task.isRecurringOccurrence ? '이 날짜만 삭제' : '삭제'}
          </button>
          <button type="submit">{task.isRecurringOccurrence ? '이 날짜만 저장' : '저장'}</button>
        </div>
      </form>
    </div>
  );
}
