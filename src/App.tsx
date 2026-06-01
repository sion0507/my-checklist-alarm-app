import { FormEvent, useEffect, useMemo, useState } from 'react';
import { addMonths, formatDateKey, getCalendarMonthDays, getVisibleTaskPills, weekdayHeaders, type CalendarMonth } from './calendarUtils';
import { buildSevenDayNotificationSchedule } from './notificationPlanner';
import { enablePushSubscription, sendBackendTestPush } from './pushClient';
import { syncUpcomingNotificationSchedule } from './scheduleSyncClient';
import {
  completeTaskOccurrence,
  createTask,
  deleteTask,
  deleteTaskOccurrence,
  getTodayDateString,
  listTaskOccurrencesForDate,
  listTasks,
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

const reminderSettingsKey = 'checklist-alarm:reminder-settings';
const pushSubscriptionEndpointKey = 'checklist-alarm:push-subscription-endpoint';

const defaultReminderSettings: ReminderSettings = {
  morningTime: '08:00',
  eveningTime: '23:00',
};

type ReminderSettings = {
  morningTime: string;
  eveningTime: string;
};

type NotificationPermissionView = NotificationPermission | 'unsupported';

const notificationPermissionLabels: Record<NotificationPermissionView, string> = {
  default: '권한 요청 필요',
  denied: '차단됨',
  granted: '허용됨',
  unsupported: '지원되지 않음',
};

function isTimeValue(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

function loadReminderSettings(): ReminderSettings {
  try {
    const stored = localStorage.getItem(reminderSettingsKey);
    if (!stored) {
      return defaultReminderSettings;
    }
    const parsed = JSON.parse(stored) as Partial<ReminderSettings>;
    return {
      morningTime: isTimeValue(parsed.morningTime) ? parsed.morningTime : defaultReminderSettings.morningTime,
      eveningTime: isTimeValue(parsed.eveningTime) ? parsed.eveningTime : defaultReminderSettings.eveningTime,
    };
  } catch {
    return defaultReminderSettings;
  }
}

function saveReminderSettings(settings: ReminderSettings) {
  localStorage.setItem(reminderSettingsKey, JSON.stringify(settings));
}

function getNotificationPermission(): NotificationPermissionView {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

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

type AppProps = {
  initialCalendarDate?: Date;
};

export default function App({ initialCalendarDate = new Date() }: AppProps) {
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [tasks, setTasks] = useState<TaskOccurrence[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [quickTitle, setQuickTitle] = useState('');
  const [calendarQuickTitle, setCalendarQuickTitle] = useState('');
  const [calendarDate, setCalendarDate] = useState(() => new Date(initialCalendarDate.getFullYear(), initialCalendarDate.getMonth(), 1));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => formatDateKey(initialCalendarDate));
  const [reminderSettings, setReminderSettings] = useState(loadReminderSettings);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionView>(getNotificationPermission);
  const [testNotificationMessage, setTestNotificationMessage] = useState('');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<TaskOccurrence | null>(null);
  const [form, setForm] = useState<TaskFormState>(emptyTaskForm);
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  async function syncNotificationSchedule(storedTasks: Task[]) {
    const endpoint = localStorage.getItem(pushSubscriptionEndpointKey);
    const jobs = buildSevenDayNotificationSchedule({
      tasks: storedTasks,
      settings: reminderSettings,
      startDate: formatDateKey(initialCalendarDate),
    });
    try {
      await syncUpcomingNotificationSchedule({ endpoint, jobs });
    } catch (error) {
      console.warn('Notification schedule sync failed', error);
    }
  }

  async function refreshTasks() {
    const today = getTodayDateString();
    const [todayOccurrences, storedTasks] = await Promise.all([listTaskOccurrencesForDate(today), listTasks()]);
    setTasks(todayOccurrences);
    setAllTasks(storedTasks);
    await syncNotificationSchedule(storedTasks);
  }

  useEffect(() => {
    void refreshTasks();
  }, []);

  useEffect(() => {
    saveReminderSettings(reminderSettings);
  }, [reminderSettings]);

  const todayTasks = useMemo(() => sortIncompleteFirst(tasks), [tasks]);
  const calendarMonth = useMemo(
    () => getCalendarMonthDays(calendarDate.getFullYear(), calendarDate.getMonth(), allTasks, getTodayDateString()),
    [allTasks, calendarDate],
  );
  const selectedDay = calendarMonth.days.find((day) => day.date === selectedCalendarDate);
  const selectedTasks = selectedDay?.tasks ?? [];

  function selectCalendarMonth(date: Date) {
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    setCalendarDate(firstDayOfMonth);
    setSelectedCalendarDate(formatDateKey(firstDayOfMonth));
  }

  function changeCalendarMonth(delta: number) {
    setCalendarDate((current) => {
      const nextMonth = addMonths(current, delta);
      setSelectedCalendarDate(formatDateKey(nextMonth));
      return nextMonth;
    });
  }

  function jumpCalendarMonth(year: number, monthIndex: number) {
    selectCalendarMonth(new Date(year, monthIndex, 1));
  }

  function handleCalendarTouchEnd(x: number) {
    if (touchStartX === null) {
      return;
    }
    const delta = x - touchStartX;
    if (Math.abs(delta) > 48) {
      changeCalendarMonth(delta > 0 ? -1 : 1);
    }
    setTouchStartX(null);
  }

  async function handleCalendarQuickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = calendarQuickTitle.trim();
    if (!title) {
      return;
    }

    await createTask({
      title,
      date: selectedCalendarDate,
      time: '',
      recurrence: 'none',
      memo: '',
      notify: false,
    });
    setCalendarQuickTitle('');
    await refreshTasks();
  }

  async function handleSelectCalendarDate(date: string) {
    setSelectedCalendarDate(date);
  }

  async function handleAddSelectedTask(task: TaskOccurrence) {
    openEditModal(task);
  }

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
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id && item.occurrenceDate === task.occurrenceDate ? { ...item, completed: !task.completed } : item,
      ),
    );
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

  async function handleTestNotification() {
    setTestNotificationMessage('');
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      setTestNotificationMessage('이 브라우저에서는 알림을 지원하지 않습니다.');
      return;
    }

    try {
      const result = await enablePushSubscription({
        metadata: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          userAgent: navigator.userAgent,
          morningTime: reminderSettings.morningTime,
          eveningTime: reminderSettings.eveningTime,
        },
      });
      localStorage.setItem(pushSubscriptionEndpointKey, result.endpoint);
      setNotificationPermission(Notification.permission);
      await sendBackendTestPush(result.endpoint);
      setTestNotificationMessage('백엔드를 통해 테스트 푸시를 요청했습니다.');
    } catch (error) {
      setNotificationPermission(getNotificationPermission());
      const message = error instanceof Error ? error.message : '테스트 푸시를 요청하지 못했습니다.';
      setTestNotificationMessage(`테스트 푸시 실패: ${message}`);
    }
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
          {active.id === 'calendar' ? (
            <CalendarPanel
              calendarQuickTitle={calendarQuickTitle}
              month={calendarMonth}
              onAddTask={handleCalendarQuickAdd}
              onJumpMonth={jumpCalendarMonth}
              onMonthChange={changeCalendarMonth}
              onOpenTask={handleAddSelectedTask}
              onQuickTitleChange={setCalendarQuickTitle}
              onSelectDate={handleSelectCalendarDate}
              onTouchEnd={handleCalendarTouchEnd}
              onTouchStart={setTouchStartX}
              selectedDate={selectedCalendarDate}
              selectedTasks={selectedTasks}
            />
          ) : null}
          {active.id === 'settings' ? (
            <SettingsPanel
              notificationPermission={notificationPermission}
              onReminderSettingsChange={setReminderSettings}
              onTestNotification={() => void handleTestNotification()}
              reminderSettings={reminderSettings}
              testNotificationMessage={testNotificationMessage}
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
            <li
              className={`task-item ${task.completed ? 'completed' : ''}`}
              data-testid="today-task-item"
              key={`${task.id}:${task.occurrenceDate ?? task.date}`}
            >
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

type CalendarPanelProps = {
  month: CalendarMonth;
  selectedDate: string;
  selectedTasks: TaskOccurrence[];
  calendarQuickTitle: string;
  onMonthChange: (delta: number) => void;
  onJumpMonth: (year: number, monthIndex: number) => void;
  onSelectDate: (date: string) => void;
  onOpenTask: (task: TaskOccurrence) => void;
  onQuickTitleChange: (value: string) => void;
  onAddTask: (event: FormEvent<HTMLFormElement>) => void;
  onTouchStart: (x: number) => void;
  onTouchEnd: (x: number) => void;
};

function CalendarPanel({
  month,
  selectedDate,
  selectedTasks,
  calendarQuickTitle,
  onMonthChange,
  onJumpMonth,
  onSelectDate,
  onOpenTask,
  onQuickTitleChange,
  onAddTask,
  onTouchStart,
  onTouchEnd,
}: CalendarPanelProps) {
  const years = Array.from({ length: 7 }, (_, index) => month.year - 3 + index);
  const selectedDateLabel = `${selectedDate} 일정`;

  return (
    <div className="calendar-panel">
      <div className="calendar-hero">
        <div>
          <p className="calendar-caption">Month view</p>
          <h2>{month.title}</h2>
        </div>
        <div className="calendar-nav" aria-label="월 이동">
          <button aria-label="이전 달" onClick={() => onMonthChange(-1)} type="button">
            ‹
          </button>
          <button aria-label="다음 달" onClick={() => onMonthChange(1)} type="button">
            ›
          </button>
        </div>
      </div>

      <div className="calendar-jump" aria-label="연월 바로 이동">
        <label>
          연도 선택
          <select value={month.year} onChange={(event) => onJumpMonth(Number(event.target.value), month.monthIndex)}>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label>
          월 선택
          <select value={month.monthIndex} onChange={(event) => onJumpMonth(month.year, Number(event.target.value))}>
            {Array.from({ length: 12 }, (_, monthIndex) => (
              <option key={monthIndex} value={monthIndex}>
                {monthIndex + 1}월
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="calendar-grid-wrap"
        onTouchStart={(event) => onTouchStart(event.changedTouches[0].clientX)}
        onTouchEnd={(event) => onTouchEnd(event.changedTouches[0].clientX)}
      >
        <div className="calendar-weekdays" role="row">
          {weekdayHeaders.map((weekday) => (
            <span className="weekday" key={weekday} role="columnheader">
              {weekday}
            </span>
          ))}
        </div>
        <div className="calendar-grid" role="grid" aria-label={`${month.title} calendar grid`}>
          {month.days.map((day) => {
            const { visible, overflowCount } = getVisibleTaskPills(day.tasks, 2);
            const dayClasses = [
              'calendar-day',
              day.isCurrentMonth ? '' : 'adjacent-month',
              day.isToday ? 'today' : '',
              day.isWeekend ? 'weekend' : '',
              day.date === selectedDate ? 'selected' : '',
              day.marker ? `marker-${day.marker}` : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div
                aria-label={`${day.date}${day.markerLabel ? ` ${day.markerLabel}` : ''}`}
                className={dayClasses}
                data-testid="calendar-day-cell"
                key={day.date}
                onClick={() => onSelectDate(day.date)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectDate(day.date);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <span className="day-number">{day.dayNumber}</span>
                {day.markerLabel ? <span className="date-marker">{day.markerLabel}</span> : null}
                <div className="task-pill-stack">
                  {visible.map((task) => (
                    <button
                      aria-label={`${task.title} 상세 열기`}
                      className="task-pill"
                      key={`${task.id}:${task.occurrenceDate}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenTask(task);
                      }}
                      type="button"
                    >
                      {task.time ? `${task.time} ` : ''}
                      {task.title}
                    </button>
                  ))}
                  {overflowCount > 0 ? <span className="more-pill">+{overflowCount} more</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section className="selected-date-panel" aria-label="선택 날짜 일정">
        <h2>{selectedDateLabel}</h2>
        <form className="quick-add" onSubmit={onAddTask}>
          <label htmlFor="calendar-add-title">선택한 날짜에 할 일 추가</label>
          <div className="quick-add-row">
            <input
              id="calendar-add-title"
              onChange={(event) => onQuickTitleChange(event.target.value)}
              placeholder="예: 약속 준비"
              type="text"
              value={calendarQuickTitle}
            />
            <button type="submit">날짜에 추가</button>
          </div>
        </form>
        {selectedTasks.length === 0 ? (
          <p className="calendar-empty">선택한 날짜에 등록된 할 일이 없습니다.</p>
        ) : (
          <ul className="selected-task-list">
            {selectedTasks.map((task) => (
              <li key={`${task.id}:${task.occurrenceDate}`}>
                <button onClick={() => onOpenTask(task)} type="button">
                  {task.time ? `${task.time} ` : ''}
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type SettingsPanelProps = {
  reminderSettings: ReminderSettings;
  notificationPermission: NotificationPermissionView;
  testNotificationMessage: string;
  onReminderSettingsChange: (settings: ReminderSettings) => void;
  onTestNotification: () => void;
};

function SettingsPanel({
  reminderSettings,
  notificationPermission,
  testNotificationMessage,
  onReminderSettingsChange,
  onTestNotification,
}: SettingsPanelProps) {
  return (
    <div className="settings-panel">
      <section className="settings-card" aria-label="알림 시간 설정">
        <h2>리마인더 시간</h2>
        <label>
          아침 알림 시간
          <input
            type="time"
            value={reminderSettings.morningTime}
            onChange={(event) => onReminderSettingsChange({ ...reminderSettings, morningTime: event.target.value })}
          />
        </label>
        <label>
          저녁 리뷰 시간
          <input
            type="time"
            value={reminderSettings.eveningTime}
            onChange={(event) => onReminderSettingsChange({ ...reminderSettings, eveningTime: event.target.value })}
          />
        </label>
      </section>

      <section className="settings-card" aria-label="알림 권한 상태">
        <h2>알림 상태</h2>
        <p className={`permission-pill permission-${notificationPermission}`}>
          알림 권한: {notificationPermissionLabels[notificationPermission]}
        </p>
        <button className="test-notification-button" onClick={onTestNotification} type="button">
          테스트 알림 보내기
        </button>
        {testNotificationMessage ? (
          <p className="notification-feedback" role="status">
            {testNotificationMessage}
          </p>
        ) : null}
      </section>

      <section className="storage-warning" aria-label="저장소 삭제 경고">
        <h2>데이터 보관 안내</h2>
        <p>브라우저 또는 PWA 저장소를 삭제하면 할 일, 반복 설정, 리마인더 시간이 이 기기에서 사라질 수 있습니다.</p>
      </section>
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
