import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  addMonths,
  formatDateKey,
  getCalendarMonthDays,
  getVisibleTaskPills,
  supportedKoreanHolidayYearRange,
  weekdayHeaders,
  type CalendarMonth,
} from './calendarUtils';
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
  projectTasksForDate,
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
  yearly: '매년',
};

const reminderSettingsKey = 'checklist-alarm:reminder-settings';
const pushSubscriptionEndpointKey = 'checklist-alarm:push-subscription-endpoint';
const morningCheckInStateKey = 'checklist-alarm:morning-check-in-state';
const eveningReviewStateKey = 'checklist-alarm:evening-review-state';
const themeColorKey = 'checklist-alarm:theme-color';
const themeModeKey = 'checklist-alarm:theme-mode';
const minimumCalendarYear = supportedKoreanHolidayYearRange.start;
const maximumCalendarYear = supportedKoreanHolidayYearRange.end;
const minimumCalendarDateKey = `${minimumCalendarYear}-01-01`;
const maximumCalendarDateKey = `${maximumCalendarYear}-12-31`;

function clampCalendarMonthDate(date: Date) {
  if (date.getFullYear() < minimumCalendarYear) {
    return new Date(minimumCalendarYear, 0, 1);
  }
  if (date.getFullYear() > maximumCalendarYear) {
    return new Date(maximumCalendarYear, 11, 1);
  }
  return date;
}

function clampCalendarDateKey(dateKey: string) {
  if (dateKey < minimumCalendarDateKey) {
    return minimumCalendarDateKey;
  }
  if (dateKey > maximumCalendarDateKey) {
    return maximumCalendarDateKey;
  }
  return dateKey;
}

function isSupportedCalendarDateKey(dateKey: string) {
  return dateKey >= minimumCalendarDateKey && dateKey <= maximumCalendarDateKey;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

function enumerateDateRange(startDate: string, endDate: string) {
  const start = startDate <= endDate ? startDate : endDate;
  const end = startDate <= endDate ? endDate : startDate;
  const dates: string[] = [];
  for (let current = start; current <= end; current = addDaysToDateKey(current, 1)) {
    dates.push(current);
  }
  return dates;
}

function createCalendarCreateForm(date: string): CalendarCreateForm {
  return {
    title: '',
    selectedDates: [date],
    rangeStart: '',
    rangeEnd: '',
    repeatType: 'weekly',
    repeatStartDate: date,
    repeatEndDate: '',
    repeatWeekdays: [],
  };
}

function canSaveCalendarCreateForm(mode: CalendarCreateMode, form: CalendarCreateForm) {
  if (!form.title.trim()) {
    return false;
  }
  if (mode === 'range') {
    return isSupportedCalendarDateKey(form.rangeStart) && isSupportedCalendarDateKey(form.rangeEnd);
  }
  if (mode === 'multi') {
    return form.selectedDates.length > 0 && form.selectedDates.every(isSupportedCalendarDateKey);
  }
  if (mode === 'repeat') {
    return isSupportedCalendarDateKey(form.repeatStartDate);
  }
  return form.selectedDates.length > 0 && form.selectedDates.slice(0, 1).every(isSupportedCalendarDateKey);
}

function firstDateOnOrAfter(startDate: string, weekday: number) {
  const start = parseDateKey(startDate);
  const delta = (weekday - start.getDay() + 7) % 7;
  return addDaysToDateKey(startDate, delta);
}

const defaultReminderSettings: ReminderSettings = {
  morningTime: '08:00',
  eveningTime: '23:00',
};

type ReminderSettings = {
  morningTime: string;
  eveningTime: string;
};

type ThemeColor = 'blue' | 'green' | 'rose' | 'purple';
type ThemeMode = 'light' | 'dark';

const themeColorLabels: Record<ThemeColor, string> = {
  blue: '파랑',
  green: '초록',
  rose: '로즈',
  purple: '보라',
};

const themeModeLabels: Record<ThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
};

const themeColorOptions = Object.keys(themeColorLabels) as ThemeColor[];
const themeModeOptions = Object.keys(themeModeLabels) as ThemeMode[];

type NotificationPermissionView = NotificationPermission | 'unsupported';

type NotificationEntryState = {
  taskId: string;
  date: string;
  occurrenceDate: string;
};

type DailyNotificationEntryState = {
  kind: 'morning' | 'evening';
  date: string;
};

type NotificationActionStatus = {
  message: string;
};

type MorningCheckInState = Record<string, 'done'>;
type EveningReviewState = Record<string, string[]>;
type CalendarCreateMode = 'single' | 'range' | 'repeat' | 'multi';
type CalendarRepeatType = 'yearly' | 'monthly' | 'weekly';

type CalendarCreateForm = {
  title: string;
  selectedDates: string[];
  rangeStart: string;
  rangeEnd: string;
  repeatType: CalendarRepeatType;
  repeatStartDate: string;
  repeatEndDate: string;
  repeatWeekdays: number[];
};

const calendarCreateTabs: Array<{ id: CalendarCreateMode; label: string }> = [
  { id: 'single', label: '일반' },
  { id: 'range', label: '기간' },
  { id: 'repeat', label: '반복' },
  { id: 'multi', label: '다중' },
];

const repeatTypeLabels: Record<CalendarRepeatType, string> = {
  yearly: '매년',
  monthly: '매월',
  weekly: '매주',
};

const koreanWeekdays = ['일', '월', '화', '수', '목', '금', '토'];
const koreanWeekdayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];


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

function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === 'string' && themeColorOptions.includes(value as ThemeColor);
}

function loadThemeColor(): ThemeColor {
  try {
    const stored = localStorage.getItem(themeColorKey);
    return isThemeColor(stored) ? stored : 'blue';
  } catch {
    return 'blue';
  }
}

function saveThemeColor(themeColor: ThemeColor) {
  localStorage.setItem(themeColorKey, themeColor);
}

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && themeModeOptions.includes(value as ThemeMode);
}

function loadThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(themeModeKey);
    return isThemeMode(stored) ? stored : 'light';
  } catch {
    return 'light';
  }
}

function saveThemeMode(themeMode: ThemeMode) {
  localStorage.setItem(themeModeKey, themeMode);
}

function loadMorningCheckInState(): MorningCheckInState {
  try {
    const stored = localStorage.getItem(morningCheckInStateKey);
    return stored ? (JSON.parse(stored) as MorningCheckInState) : {};
  } catch {
    return {};
  }
}

function saveMorningCheckInState(state: MorningCheckInState) {
  localStorage.setItem(morningCheckInStateKey, JSON.stringify(state));
}

function loadEveningReviewState(): EveningReviewState {
  try {
    const stored = localStorage.getItem(eveningReviewStateKey);
    return stored ? (JSON.parse(stored) as EveningReviewState) : {};
  } catch {
    return {};
  }
}

function saveEveningReviewState(state: EveningReviewState) {
  localStorage.setItem(eveningReviewStateKey, JSON.stringify(state));
}

function taskReviewKey(task: TaskOccurrence) {
  return `${task.id}:${task.occurrenceDate}`;
}

function minutesSinceStartOfDay(time: string) {
  const [hour = '0', minute = '0'] = time.split(':');
  return Number(hour) * 60 + Number(minute);
}

function isAfterReminderTime(currentDate: Date, reminderTime: string) {
  const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
  return currentMinutes >= minutesSinceStartOfDay(reminderTime);
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

function loadNotificationEntry(): NotificationEntryState | null {
  const params = new URLSearchParams(window.location.search);
  const taskId = params.get('taskId');
  const date = params.get('date');
  const occurrenceDate = params.get('occurrenceDate') ?? date;
  if (params.get('entry') !== 'notification' || !taskId || !date || !occurrenceDate) {
    return null;
  }
  return { taskId, date, occurrenceDate };
}

function loadDailyNotificationEntry(): DailyNotificationEntryState | null {
  const params = new URLSearchParams(window.location.search);
  const entry = params.get('entry');
  const date = params.get('date');
  if ((entry !== 'morning' && entry !== 'evening') || !date) {
    return null;
  }
  return { kind: entry, date };
}

function notificationTaskKey(entry: NotificationEntryState | null) {
  return entry ? `${entry.taskId}:${entry.occurrenceDate}` : '';
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
  const initialNotificationEntry = loadNotificationEntry();
  const initialDailyNotificationEntry = loadDailyNotificationEntry();
  const [notificationEntry, setNotificationEntry] = useState<NotificationEntryState | null>(initialNotificationEntry);
  const [notificationActionStatus, setNotificationActionStatus] = useState<NotificationActionStatus | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(initialNotificationEntry ? 'calendar' : 'today');
  const [tasks, setTasks] = useState<TaskOccurrence[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [quickTitle, setQuickTitle] = useState('');
  const [morningQuickTitle, setMorningQuickTitle] = useState('');
  const [morningCheckInState, setMorningCheckInState] = useState(loadMorningCheckInState);
  const [eveningReviewState, setEveningReviewState] = useState(loadEveningReviewState);
  const [eveningMoveDates, setEveningMoveDates] = useState<Record<string, string>>({});
  const [calendarQuickTitle, setCalendarQuickTitle] = useState('');
  const [isCalendarCreateSheetOpen, setIsCalendarCreateSheetOpen] = useState(false);
  const [calendarCreateMode, setCalendarCreateMode] = useState<CalendarCreateMode>('single');
  const [calendarCreateForm, setCalendarCreateForm] = useState<CalendarCreateForm>(() => createCalendarCreateForm(formatDateKey(initialCalendarDate)));
  const [isSelectedDateModalOpen, setIsSelectedDateModalOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => {
    const initialDate = initialNotificationEntry?.date ? new Date(`${initialNotificationEntry.date}T00:00:00`) : initialCalendarDate;
    const clampedDate = clampCalendarMonthDate(initialDate);
    return new Date(clampedDate.getFullYear(), clampedDate.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => {
    const initialSelectedDate = initialNotificationEntry?.date ?? formatDateKey(initialCalendarDate);
    return clampCalendarDateKey(initialSelectedDate);
  });
  const [notificationMoveDate, setNotificationMoveDate] = useState(() => initialNotificationEntry?.date ?? formatDateKey(initialCalendarDate));
  const [reminderSettings, setReminderSettings] = useState(loadReminderSettings);
  const [themeColor, setThemeColor] = useState(loadThemeColor);
  const [themeMode, setThemeMode] = useState(loadThemeMode);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionView>(getNotificationPermission);
  const [testNotificationMessage, setTestNotificationMessage] = useState('');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<TaskOccurrence | null>(null);
  const [form, setForm] = useState<TaskFormState>(emptyTaskForm);
  const [settingsRecurringForm, setSettingsRecurringForm] = useState<TaskFormState>(() => ({
    ...emptyTaskForm(),
    date: formatDateKey(initialCalendarDate),
    recurrence: 'daily',
  }));
  const [settingsRecurringStatus, setSettingsRecurringStatus] = useState('');
  const didInitializeReminderSettings = useRef(false);
  const selectedDateModalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectedDateModalReturnFocusRef = useRef<HTMLElement | null>(null);
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const appToday = formatDateKey(initialCalendarDate);
  const todayPanelDate = initialDailyNotificationEntry?.date ?? appToday;

  async function syncNotificationSchedule(storedTasks: Task[]) {
    const endpoint = localStorage.getItem(pushSubscriptionEndpointKey);
    const jobs = buildSevenDayNotificationSchedule({
      tasks: storedTasks,
      settings: reminderSettings,
      startDate: appToday,
    });
    try {
      await syncUpcomingNotificationSchedule({ endpoint, jobs });
    } catch (error) {
      console.warn('Notification schedule sync failed', error);
    }
  }

  async function refreshTasks() {
    const [todayOccurrences, storedTasks] = await Promise.all([listTaskOccurrencesForDate(todayPanelDate), listTasks()]);
    setTasks(todayOccurrences);
    setAllTasks(storedTasks);
    await syncNotificationSchedule(storedTasks);
  }

  async function resyncNotificationScheduleFromStore() {
    if (!localStorage.getItem(pushSubscriptionEndpointKey)) {
      return;
    }
    await syncNotificationSchedule(await listTasks());
  }

  useEffect(() => {
    void refreshTasks();
  }, []);

  useEffect(() => {
    saveReminderSettings(reminderSettings);
    if (!didInitializeReminderSettings.current) {
      didInitializeReminderSettings.current = true;
      return;
    }
    void resyncNotificationScheduleFromStore();
  }, [reminderSettings]);

  useEffect(() => {
    if (!isSelectedDateModalOpen || editingTask) {
      return undefined;
    }
    selectedDateModalCloseButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeSelectedDateModal();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingTask, isSelectedDateModalOpen]);

  const todayTasks = useMemo(() => sortIncompleteFirst(tasks), [tasks]);
  const todayDate = todayPanelDate;
  const showMorningCheckIn = morningCheckInState[todayDate] !== 'done' || initialDailyNotificationEntry?.kind === 'morning';
  const showEveningReview = isAfterReminderTime(initialCalendarDate, reminderSettings.eveningTime) || initialDailyNotificationEntry?.kind === 'evening';
  const reviewedEveningTasks = eveningReviewState[todayDate] ?? [];
  const unfinishedEveningTasks = todayTasks.filter((task) => !task.completed);
  const eveningReviewTasks = unfinishedEveningTasks.filter((task) => !reviewedEveningTasks.includes(taskReviewKey(task)));
  const calendarMonth = useMemo(
    () => getCalendarMonthDays(calendarDate.getFullYear(), calendarDate.getMonth(), allTasks, getTodayDateString()),
    [allTasks, calendarDate],
  );
  const selectedDay = calendarMonth.days.find((day) => day.date === selectedCalendarDate);
  const selectedTasks = selectedDay?.tasks ?? [];
  const highlightedTaskKey = notificationTaskKey(notificationEntry);
  const notificationTask = notificationEntry
    ? projectTasksForDate(allTasks, notificationEntry.date).find(
        (task) => task.id === notificationEntry.taskId && task.occurrenceDate === notificationEntry.occurrenceDate,
      ) ?? null
    : null;

  function selectCalendarMonth(date: Date) {
    const safeDate = clampCalendarMonthDate(date);
    const firstDayOfMonth = new Date(safeDate.getFullYear(), safeDate.getMonth(), 1);
    setCalendarDate(firstDayOfMonth);
    setSelectedCalendarDate(formatDateKey(firstDayOfMonth));
    setIsSelectedDateModalOpen(false);
  }

  function changeCalendarMonth(delta: number) {
    setCalendarDate((current) => {
      const nextMonth = addMonths(current, delta);
      if (nextMonth.getFullYear() < minimumCalendarYear) {
        setSelectedCalendarDate(minimumCalendarDateKey);
        setIsSelectedDateModalOpen(false);
        return current;
      }
      if (nextMonth.getFullYear() > maximumCalendarYear) {
        setSelectedCalendarDate(maximumCalendarDateKey);
        setIsSelectedDateModalOpen(false);
        return current;
      }
      setSelectedCalendarDate(formatDateKey(nextMonth));
      setIsSelectedDateModalOpen(false);
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

  function openCalendarCreateSheet() {
    setCalendarCreateMode('single');
    setCalendarCreateForm(createCalendarCreateForm(selectedCalendarDate));
    setIsSelectedDateModalOpen(false);
    setIsCalendarCreateSheetOpen(true);
  }

  function closeCalendarCreateSheet() {
    setIsCalendarCreateSheetOpen(false);
  }

  function updateCalendarCreateForm(updates: Partial<CalendarCreateForm>) {
    setCalendarCreateForm((current) => ({ ...current, ...updates }));
  }

  function handleCalendarCreateModeChange(mode: CalendarCreateMode) {
    setCalendarCreateMode(mode);
    if (mode === 'range') {
      setCalendarCreateForm((current) => ({ ...current, rangeStart: '', rangeEnd: '' }));
    }
    if (mode === 'multi') {
      setCalendarCreateForm((current) => ({ ...current, selectedDates: [] }));
    }
  }

  function handleCalendarCreateDatePick(date: string) {
    if (!isSupportedCalendarDateKey(date)) {
      return;
    }
    setSelectedCalendarDate(date);
    if (calendarCreateMode === 'range') {
      setCalendarCreateForm((current) => {
        if (!current.rangeStart || (current.rangeEnd && current.rangeEnd !== current.rangeStart)) {
          return { ...current, rangeStart: date, rangeEnd: '' };
        }
        return { ...current, rangeEnd: date };
      });
      return;
    }
    if (calendarCreateMode === 'multi') {
      setCalendarCreateForm((current) => {
        const selectedDates = current.selectedDates.includes(date)
          ? current.selectedDates.filter((item) => item !== date)
          : [...current.selectedDates, date].sort();
        return { ...current, selectedDates };
      });
      return;
    }
    setCalendarCreateForm((current) => ({ ...current, selectedDates: [date], repeatStartDate: date }));
  }

  function toggleCalendarRepeatWeekday(weekday: number) {
    setCalendarCreateForm((current) => {
      const repeatWeekdays = current.repeatWeekdays.includes(weekday)
        ? current.repeatWeekdays.filter((item) => item !== weekday)
        : [...current.repeatWeekdays, weekday].sort((a, b) => a - b);
      return { ...current, repeatWeekdays };
    });
  }

  async function handleSaveCalendarCreateSheet() {
    if (!canSaveCalendarCreateForm(calendarCreateMode, calendarCreateForm)) {
      return;
    }
    const title = calendarCreateForm.title.trim();

    if (calendarCreateMode === 'repeat') {
      if (calendarCreateForm.repeatType === 'weekly') {
        const weekdays = calendarCreateForm.repeatWeekdays.length > 0 ? calendarCreateForm.repeatWeekdays : [parseDateKey(calendarCreateForm.repeatStartDate).getDay()];
        for (const weekday of weekdays) {
          await createTask({
            title,
            date: firstDateOnOrAfter(calendarCreateForm.repeatStartDate, weekday),
            time: '',
            recurrence: 'weekly',
            memo: '',
            notify: false,
          });
        }
      } else {
        await createTask({
          title,
          date: calendarCreateForm.repeatStartDate,
          time: '',
          recurrence: calendarCreateForm.repeatType === 'yearly' ? 'yearly' : 'monthly',
          memo: '',
          notify: false,
        });
      }
    } else {
      const dates = calendarCreateMode === 'range'
        ? enumerateDateRange(calendarCreateForm.rangeStart, calendarCreateForm.rangeEnd)
        : calendarCreateMode === 'multi'
          ? calendarCreateForm.selectedDates
          : calendarCreateForm.selectedDates.slice(0, 1);
      for (const date of dates) {
        await createTask({ title, date, time: '', recurrence: 'none', memo: '', notify: false });
      }
    }

    setIsCalendarCreateSheetOpen(false);
    await refreshTasks();
  }

  function closeSelectedDateModal() {
    setIsSelectedDateModalOpen(false);
    const returnFocusTarget = selectedDateModalReturnFocusRef.current;
    selectedDateModalReturnFocusRef.current = null;
    if (returnFocusTarget) {
      window.requestAnimationFrame(() => returnFocusTarget.focus());
    }
  }

  async function handleSelectCalendarDate(date: string, returnFocusTarget?: HTMLElement) {
    if (!isSupportedCalendarDateKey(date)) {
      return;
    }
    selectedDateModalReturnFocusRef.current = returnFocusTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setSelectedCalendarDate(date);
    setIsSelectedDateModalOpen(true);
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
      date: todayPanelDate,
      time: '',
      recurrence: 'none',
      memo: '',
      notify: false,
    });
    setQuickTitle('');
    await refreshTasks();
  }

  async function handleMorningQuickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = morningQuickTitle.trim();
    if (!title) {
      return;
    }

    await createTask({
      title,
      date: todayPanelDate,
      time: '',
      recurrence: 'none',
      memo: '',
      notify: false,
    });
    setMorningQuickTitle('');
    await refreshTasks();
  }

  function completeMorningCheckIn() {
    setMorningCheckInState((current) => {
      const next = { ...current, [todayPanelDate]: 'done' as const };
      saveMorningCheckInState(next);
      return next;
    });
  }

  function markEveningTaskReviewed(task: TaskOccurrence) {
    setEveningReviewState((current) => {
      const reviewed = current[todayPanelDate] ?? [];
      const next = { ...current, [todayPanelDate]: Array.from(new Set([...reviewed, taskReviewKey(task)])) };
      saveEveningReviewState(next);
      return next;
    });
  }

  function handleEveningMoveDateChange(task: TaskOccurrence, date: string) {
    setEveningMoveDates((current) => ({ ...current, [taskReviewKey(task)]: date }));
  }

  async function handleDeleteEveningTask(task: TaskOccurrence) {
    await handleDeleteTask(task);
  }

  async function handleMoveEveningTask(task: TaskOccurrence) {
    const moveDate = eveningMoveDates[taskReviewKey(task)] ?? task.date;
    if (task.isRecurringOccurrence) {
      await moveTaskOccurrence(task.id, task.occurrenceDate, moveDate);
    } else {
      await updateTask(task.id, { date: moveDate });
    }
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

  async function handleCompleteNotificationTask(task: TaskOccurrence) {
    if (task.isRecurringOccurrence) {
      await completeTaskOccurrence(task.id, task.occurrenceDate, true);
    } else {
      await updateTask(task.id, { completed: true });
    }
    setNotificationActionStatus({ message: `${task.title} 완료 처리했습니다.` });
    await refreshTasks();
  }

  async function handleDeleteNotificationTask(task: TaskOccurrence) {
    if (task.isRecurringOccurrence) {
      await deleteTaskOccurrence(task.id, task.occurrenceDate);
    } else {
      await deleteTask(task.id);
    }
    setNotificationEntry(null);
    setNotificationActionStatus({ message: `${task.title} 삭제했습니다.` });
    await refreshTasks();
  }

  async function handleMoveNotificationTask(task: TaskOccurrence) {
    if (!notificationMoveDate) {
      return;
    }
    if (task.isRecurringOccurrence) {
      await moveTaskOccurrence(task.id, task.occurrenceDate, notificationMoveDate);
    } else {
      await updateTask(task.id, { date: notificationMoveDate });
    }
    const movedEntry = {
      taskId: task.id,
      date: notificationMoveDate,
      occurrenceDate: task.isRecurringOccurrence ? task.occurrenceDate : notificationMoveDate,
    };
    setNotificationEntry(movedEntry);
    setNotificationActionStatus({ message: `${task.title} ${notificationMoveDate}로 이동했습니다.` });
    selectCalendarMonth(new Date(`${notificationMoveDate}T00:00:00`));
    setSelectedCalendarDate(notificationMoveDate);
    window.history.replaceState(
      {},
      '',
      `/?date=${notificationMoveDate}&taskId=${encodeURIComponent(movedEntry.taskId)}&occurrenceDate=${encodeURIComponent(movedEntry.occurrenceDate)}&entry=notification`,
    );
    await refreshTasks();
  }

  function handleThemeColorChange(nextThemeColor: ThemeColor) {
    setThemeColor(nextThemeColor);
    saveThemeColor(nextThemeColor);
  }

  function handleThemeModeChange(nextThemeMode: ThemeMode) {
    setThemeMode(nextThemeMode);
    saveThemeMode(nextThemeMode);
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
      await resyncNotificationScheduleFromStore();
      await sendBackendTestPush(result.endpoint);
      setTestNotificationMessage('백엔드를 통해 테스트 푸시를 요청했습니다.');
    } catch (error) {
      setNotificationPermission(getNotificationPermission());
      const message = error instanceof Error ? error.message : '테스트 푸시를 요청하지 못했습니다.';
      setTestNotificationMessage(`테스트 푸시 실패: ${message}`);
    }
  }

  async function handleCreateSettingsRecurringTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = settingsRecurringForm.title.trim();
    if (!title || !settingsRecurringForm.date || settingsRecurringForm.recurrence === 'none') {
      return;
    }

    await createTask({
      ...settingsRecurringForm,
      title,
      recurrence: settingsRecurringForm.recurrence,
    });
    setSettingsRecurringForm((current) => ({
      ...current,
      title: '',
      time: '',
      memo: '',
      notify: false,
    }));
    setSettingsRecurringStatus(`${title} 반복 할 일을 추가했습니다.`);
    await refreshTasks();
  }

  return (
    <main className="app-shell" data-theme-color={themeColor} data-theme-mode={themeMode} aria-label="Checklist Alarm PWA">
      <section className="phone-frame">
        <header className="app-header">
          <p className="app-kicker">Checklist Alarm</p>
        </header>

        <section
          className="content-card"
          data-active-tab={active.id}
          data-scroll-mode={active.id === 'settings' ? 'scroll' : active.id === 'calendar' || active.id === 'today' ? 'internal' : 'fixed'}
          id={`${active.id}-panel`}
          aria-label="활성 탭 화면"
        >
          {notificationEntry || notificationActionStatus ? (
            <NotificationEntryPanel
              moveDate={notificationMoveDate}
              onComplete={handleCompleteNotificationTask}
              onDelete={handleDeleteNotificationTask}
              onMove={handleMoveNotificationTask}
              onMoveDateChange={setNotificationMoveDate}
              status={notificationActionStatus?.message ?? ''}
              task={notificationTask}
            />
          ) : null}
          {active.id === 'today' ? (
            <TodayPanel
              eveningMoveDates={eveningMoveDates}
              eveningReviewTasks={eveningReviewTasks}
              hasUnfinishedEveningTasks={unfinishedEveningTasks.length > 0}
              showEveningReview={showEveningReview}
              onDeleteEveningTask={(task) => void handleDeleteEveningTask(task)}
              onDeleteTask={handleDeleteTask}
              onEditTask={openEditModal}
              onEveningMoveDateChange={handleEveningMoveDateChange}
              onLeaveEveningTask={markEveningTaskReviewed}
              onMorningCheckInComplete={completeMorningCheckIn}
              onMorningQuickAdd={handleMorningQuickAdd}
              onMorningQuickTitleChange={setMorningQuickTitle}
              onMoveEveningTask={(task) => void handleMoveEveningTask(task)}
              onQuickAdd={handleQuickAdd}
              onQuickTitleChange={setQuickTitle}
              onToggleComplete={handleToggleComplete}
              quickTitle={quickTitle}
              morningQuickTitle={morningQuickTitle}
              showMorningCheckIn={showMorningCheckIn}
              tasks={todayTasks}
            />
          ) : null}
          {active.id === 'calendar' ? (
            <CalendarPanel
              highlightedTaskKey={highlightedTaskKey}
              month={calendarMonth}
              onJumpMonth={jumpCalendarMonth}
              onOpenCreate={openCalendarCreateSheet}
              onOpenTask={handleAddSelectedTask}
              onSelectDate={handleSelectCalendarDate}
              onTouchEnd={handleCalendarTouchEnd}
              onTouchStart={setTouchStartX}
              selectedDate={selectedCalendarDate}
            />
          ) : null}
          {active.id === 'settings' ? (
            <SettingsPanel
              notificationPermission={notificationPermission}
              onReminderSettingsChange={setReminderSettings}
              onSettingsRecurringFormChange={setSettingsRecurringForm}
              onSettingsRecurringSubmit={handleCreateSettingsRecurringTask}
              onTestNotification={() => void handleTestNotification()}
              onThemeColorChange={handleThemeColorChange}
              onThemeModeChange={handleThemeModeChange}
              reminderSettings={reminderSettings}
              settingsRecurringForm={settingsRecurringForm}
              settingsRecurringStatus={settingsRecurringStatus}
              testNotificationMessage={testNotificationMessage}
              themeColor={themeColor}
              themeMode={themeMode}
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

      {isSelectedDateModalOpen ? (
        <SelectedDateModal
          calendarQuickTitle={calendarQuickTitle}
          closeButtonRef={selectedDateModalCloseButtonRef}
          highlightedTaskKey={highlightedTaskKey}
          onAddTask={handleCalendarQuickAdd}
          onClose={closeSelectedDateModal}
          onOpenTask={handleAddSelectedTask}
          onQuickTitleChange={setCalendarQuickTitle}
          selectedDate={selectedCalendarDate}
          selectedTasks={selectedTasks}
        />
      ) : null}

      {isCalendarCreateSheetOpen ? (
        <CalendarCreateSheet
          form={calendarCreateForm}
          mode={calendarCreateMode}
          month={calendarMonth}
          onCancel={closeCalendarCreateSheet}
          onDatePick={handleCalendarCreateDatePick}
          onFormChange={updateCalendarCreateForm}
          onModeChange={handleCalendarCreateModeChange}
          onSave={() => void handleSaveCalendarCreateSheet()}
          onToggleWeekday={toggleCalendarRepeatWeekday}
        />
      ) : null}

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

type NotificationEntryPanelProps = {
  task: TaskOccurrence | null;
  moveDate: string;
  status: string;
  onMoveDateChange: (date: string) => void;
  onComplete: (task: TaskOccurrence) => void;
  onDelete: (task: TaskOccurrence) => void;
  onMove: (task: TaskOccurrence) => void;
};

function NotificationEntryPanel({
  task,
  moveDate,
  status,
  onMoveDateChange,
  onComplete,
  onDelete,
  onMove,
}: NotificationEntryPanelProps) {
  return (
    <section className="notification-entry-card" aria-label="알림에서 열린 할 일">
      <p className="notification-entry-kicker">Notification entry</p>
      {task ? (
        <>
          <h2>
            {task.time ? `${task.time} ` : ''}
            {task.title}
          </h2>
          <p className="notification-entry-copy">알림을 눌러 연 할 일입니다. 바로 처리하거나 날짜를 옮길 수 있습니다.</p>
          <div className="notification-entry-actions" aria-label={`${task.title} 알림 빠른 작업`}>
            <button onClick={() => onComplete(task)} type="button">
              {task.title} 완료
            </button>
            <button className="danger-button" onClick={() => onDelete(task)} type="button">
              {task.title} 삭제
            </button>
            <label>
              이동할 날짜
              <input
                aria-label={`${task.title} 이동할 날짜`}
                onChange={(event) => onMoveDateChange(event.target.value)}
                type="date"
                value={moveDate}
              />
            </label>
            <button onClick={() => onMove(task)} type="button">
              {task.title} 이동
            </button>
          </div>
        </>
      ) : (
        <p className="notification-entry-copy">알림과 연결된 할 일을 찾을 수 없습니다.</p>
      )}
      {status ? (
        <p className="notification-entry-status" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}

type TodayPanelProps = {
  tasks: TaskOccurrence[];
  quickTitle: string;
  morningQuickTitle: string;
  showMorningCheckIn: boolean;
  eveningReviewTasks: TaskOccurrence[];
  eveningMoveDates: Record<string, string>;
  hasUnfinishedEveningTasks: boolean;
  showEveningReview: boolean;
  onQuickTitleChange: (value: string) => void;
  onQuickAdd: (event: FormEvent<HTMLFormElement>) => void;
  onMorningQuickTitleChange: (value: string) => void;
  onMorningQuickAdd: (event: FormEvent<HTMLFormElement>) => void;
  onMorningCheckInComplete: () => void;
  onEveningMoveDateChange: (task: TaskOccurrence, date: string) => void;
  onLeaveEveningTask: (task: TaskOccurrence) => void;
  onDeleteEveningTask: (task: TaskOccurrence) => void;
  onMoveEveningTask: (task: TaskOccurrence) => void;
  onToggleComplete: (task: TaskOccurrence) => void;
  onEditTask: (task: TaskOccurrence) => void;
  onDeleteTask: (task: TaskOccurrence) => void;
};

function TodayPanel({
  tasks,
  quickTitle,
  morningQuickTitle,
  showMorningCheckIn,
  eveningReviewTasks,
  eveningMoveDates,
  hasUnfinishedEveningTasks,
  showEveningReview,
  onQuickTitleChange,
  onQuickAdd,
  onMorningQuickTitleChange,
  onMorningQuickAdd,
  onMorningCheckInComplete,
  onEveningMoveDateChange,
  onLeaveEveningTask,
  onDeleteEveningTask,
  onMoveEveningTask,
  onToggleComplete,
  onEditTask,
  onDeleteTask,
}: TodayPanelProps) {
  return (
    <div className="today-panel">
      {showMorningCheckIn ? (
        <section className="morning-check-in" aria-label="아침 체크인 카드">
          <div className="morning-check-in-header">
            <div>
              <p className="morning-kicker">Morning</p>
              <h2>아침 체크인</h2>
            </div>
            <button onClick={onMorningCheckInComplete} type="button">
              오늘 체크인 완료
            </button>
          </div>
          <p className="morning-summary">오늘 할 일 {tasks.length}개를 확인해 보세요.</p>
          {tasks.length > 0 ? (
            <ul className="morning-task-list" aria-label="아침 체크인 오늘 할 일 요약">
              {tasks.slice(0, 4).map((task) => (
                <li key={`${task.id}:${task.occurrenceDate ?? task.date}`}>• {task.title}</li>
              ))}
            </ul>
          ) : (
            <p className="morning-empty">아직 등록된 오늘 할 일이 없습니다.</p>
          )}
          <form className="morning-quick-add" onSubmit={onMorningQuickAdd}>
            <label htmlFor="morning-quick-add-title">추가할 일이 더 있나요?</label>
            <div className="quick-add-row">
              <input
                id="morning-quick-add-title"
                aria-label="아침 체크인 빠른 추가"
                onChange={(event) => onMorningQuickTitleChange(event.target.value)}
                placeholder="예: 물 마시기"
                type="text"
                value={morningQuickTitle}
              />
              <button type="submit">체크인에서 추가</button>
            </div>
          </form>
        </section>
      ) : null}

      {showEveningReview ? (
        <EveningReviewCard
          hasUnfinishedTasks={hasUnfinishedEveningTasks}
          moveDates={eveningMoveDates}
          onDeleteTask={onDeleteEveningTask}
          onLeaveTask={onLeaveEveningTask}
          onMoveDateChange={onEveningMoveDateChange}
          onMoveTask={onMoveEveningTask}
          tasks={eveningReviewTasks}
        />
      ) : null}

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

type EveningReviewCardProps = {
  tasks: TaskOccurrence[];
  moveDates: Record<string, string>;
  hasUnfinishedTasks: boolean;
  onLeaveTask: (task: TaskOccurrence) => void;
  onDeleteTask: (task: TaskOccurrence) => void;
  onMoveTask: (task: TaskOccurrence) => void;
  onMoveDateChange: (task: TaskOccurrence, date: string) => void;
};

function EveningReviewCard({
  tasks,
  moveDates,
  hasUnfinishedTasks,
  onLeaveTask,
  onDeleteTask,
  onMoveTask,
  onMoveDateChange,
}: EveningReviewCardProps) {
  const completionMessage = hasUnfinishedTasks
    ? '오늘 저녁 리뷰가 완료되었습니다. 남긴 할 일은 그대로 유지됩니다.'
    : '오늘 미완료 할 일이 없습니다. 편안한 저녁 보내세요.';

  return (
    <section className="evening-review-card" aria-label="저녁 미완료 리뷰">
      <div className="evening-review-header">
        <div>
          <p className="evening-kicker">Evening</p>
          <h2>저녁 리뷰</h2>
        </div>
      </div>
      {tasks.length === 0 ? (
        <p className="evening-empty">{completionMessage}</p>
      ) : (
        <ul className="evening-review-list" aria-label="저녁 리뷰 미완료 할 일">
          {tasks.map((task) => {
            const key = taskReviewKey(task);
            return (
              <li key={key}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.time ? `${task.time} · ` : ''}미완료</span>
                </div>
                <div className="evening-review-actions">
                  <button type="button" onClick={() => onLeaveTask(task)}>
                    {task.title} 그대로 두기
                  </button>
                  <button className="danger-button" type="button" onClick={() => onDeleteTask(task)}>
                    {task.title} 삭제
                  </button>
                  <label>
                    이동할 날짜
                    <input
                      aria-label={`${task.title} 이동할 날짜`}
                      onChange={(event) => onMoveDateChange(task, event.target.value)}
                      type="date"
                      value={moveDates[key] ?? task.date}
                    />
                  </label>
                  <button type="button" onClick={() => onMoveTask(task)}>
                    {task.title} 이동
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type CalendarPanelProps = {
  month: CalendarMonth;
  selectedDate: string;
  highlightedTaskKey: string;
  onJumpMonth: (year: number, monthIndex: number) => void;
  onSelectDate: (date: string, returnFocusTarget?: HTMLElement) => void;
  onOpenTask: (task: TaskOccurrence) => void;
  onOpenCreate: () => void;
  onTouchStart: (x: number) => void;
  onTouchEnd: (x: number) => void;
};

function CalendarPanel({
  month,
  selectedDate,
  highlightedTaskKey,
  onJumpMonth,
  onSelectDate,
  onOpenTask,
  onOpenCreate,
  onTouchStart,
  onTouchEnd,
}: CalendarPanelProps) {
  const visibleYearCount = Math.min(7, maximumCalendarYear - minimumCalendarYear + 1);
  const firstYear = Math.min(Math.max(minimumCalendarYear, month.year - 3), maximumCalendarYear - visibleYearCount + 1);
  const years = Array.from({ length: visibleYearCount }, (_, index) => firstYear + index);

  return (
    <div className="calendar-panel">
      <button className="calendar-create-open-button" onClick={onOpenCreate} type="button">
        캘린더에서 할 일 만들기
      </button>
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
                onClick={(event) => onSelectDate(day.date, event.currentTarget)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectDate(day.date, event.currentTarget);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <span className="day-number">{day.dayNumber}</span>
                {day.markerLabel ? <span className="date-marker">{day.markerLabel}</span> : null}
                <div className="task-pill-stack">
                  {visible.map((task) => {
                    const taskKey = `${task.id}:${task.occurrenceDate}`;
                    const isHighlighted = taskKey === highlightedTaskKey;
                    return (
                      <button
                        aria-label={`${task.title} 상세 열기`}
                        className={`task-pill ${isHighlighted ? 'notification-highlight' : ''}`}
                        key={taskKey}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenTask(task);
                        }}
                        type="button"
                      >
                        {task.time ? `${task.time} ` : ''}
                        {task.title}
                      </button>
                    );
                  })}
                  {overflowCount > 0 ? <span className="more-pill">+{overflowCount} more</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}


type CalendarCreateSheetProps = {
  mode: CalendarCreateMode;
  form: CalendarCreateForm;
  month: CalendarMonth;
  onCancel: () => void;
  onDatePick: (date: string) => void;
  onFormChange: (updates: Partial<CalendarCreateForm>) => void;
  onModeChange: (mode: CalendarCreateMode) => void;
  onSave: () => void;
  onToggleWeekday: (weekday: number) => void;
};

function CalendarCreateSheet({
  mode,
  form,
  month,
  onCancel,
  onDatePick,
  onFormChange,
  onModeChange,
  onSave,
  onToggleWeekday,
}: CalendarCreateSheetProps) {
  const rangeDates = mode === 'range' && form.rangeStart ? new Set(enumerateDateRange(form.rangeStart, form.rangeEnd || form.rangeStart)) : new Set<string>();
  const repeatRecurrenceValue: Recurrence = form.repeatType === 'yearly' ? 'yearly' : form.repeatType === 'monthly' ? 'monthly' : 'weekly';
  const isSaveDisabled = !canSaveCalendarCreateForm(mode, form);

  return (
    <div className="calendar-create-sheet-layer" role="presentation">
      <section className="calendar-create-sheet" data-calendar-create-sheet="true" role="dialog" aria-modal="true" aria-label="캘린더 할 일 생성">
        <div className="calendar-sheet-handle" data-testid="calendar-sheet-handle" />
        <div className="calendar-sheet-actions">
          <button className="sheet-cancel-button" aria-label="캘린더 생성 취소" onClick={onCancel} type="button">🗓︎×</button>
          <button className="sheet-save-button" aria-label="캘린더 생성 저장" disabled={isSaveDisabled} onClick={onSave} type="button">✓</button>
        </div>
        <label className="calendar-create-title-label">
          캘린더 생성 제목
          <input value={form.title} onChange={(event) => onFormChange({ title: event.target.value })} placeholder="할 일 제목" type="text" />
        </label>
        <div className="calendar-create-tabs" role="tablist" aria-label="캘린더 생성 유형">
          {calendarCreateTabs.map((tab) => (
            <button aria-selected={mode === tab.id} className={`calendar-create-tab ${mode === tab.id ? 'active' : ''}`} key={tab.id} onClick={() => onModeChange(tab.id)} role="tab" type="button">
              {tab.label}
            </button>
          ))}
        </div>
        {mode === 'repeat' ? (
          <div className="repeat-settings-card">
            <label className="repeat-setting-row">
              <span>↪ 반복 유형</span>
              <select value={form.repeatType} onChange={(event) => onFormChange({ repeatType: event.target.value as CalendarRepeatType })} aria-label="반복 유형">
                {Object.entries(repeatTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {form.repeatType === 'weekly' ? (
              <div className="repeat-weekday-row" aria-label="반복 요일 선택">
                {koreanWeekdays.map((weekday, index) => (
                  <button aria-label={`${koreanWeekdayNames[index]} 선택`} className={`repeat-weekday-pill ${form.repeatWeekdays.includes(index) ? 'selected' : ''}`} key={weekday} onClick={() => onToggleWeekday(index)} type="button">
                    {weekday}
                  </button>
                ))}
              </div>
            ) : null}
            <label className="repeat-setting-row">
              <span>▦ 시작 날짜</span>
              <input aria-label="시작 날짜" type="date" value={form.repeatStartDate} onChange={(event) => onFormChange({ repeatStartDate: event.target.value })} />
            </label>
            <label className="repeat-setting-row">
              <span>▦ 종료 날짜</span>
              <input aria-label="종료 날짜 없음" type="text" readOnly value={form.repeatEndDate || '없음'} />
            </label>
            <p className="settings-help">저장 시 {recurrenceLabels[repeatRecurrenceValue]} 반복 할 일로 오늘/캘린더에 함께 표시됩니다.</p>
          </div>
        ) : (
          <div className="calendar-create-month" aria-label={`${month.title} 생성 캘린더`}>
            <h2>{month.year}년 {month.monthIndex + 1}월</h2>
            <div className="calendar-create-weekdays" role="row">
              {koreanWeekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="calendar-create-grid">
              {month.days.map((day) => {
                const isSingleSelected = mode === 'single' && form.selectedDates.includes(day.date);
                const isMultiSelected = mode === 'multi' && form.selectedDates.includes(day.date);
                const isRangeEndpoint = mode === 'range' && (day.date === form.rangeStart || day.date === form.rangeEnd);
                const isInRange = mode === 'range' && rangeDates.has(day.date) && !isRangeEndpoint;
                const classes = ['calendar-create-day', day.isCurrentMonth ? '' : 'adjacent-month', isSingleSelected ? 'single-selected' : '', isMultiSelected ? 'multi-selected' : '', isRangeEndpoint ? 'range-endpoint' : '', isInRange ? 'in-range' : ''].filter(Boolean).join(' ');
                return <button aria-label={`${day.date} 선택`} className={classes} key={day.date} onClick={() => onDatePick(day.date)} type="button">{day.dayNumber}</button>;
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

type SelectedDateModalProps = {
  selectedDate: string;
  selectedTasks: TaskOccurrence[];
  highlightedTaskKey: string;
  calendarQuickTitle: string;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onOpenTask: (task: TaskOccurrence) => void;
  onQuickTitleChange: (value: string) => void;
  onAddTask: (event: FormEvent<HTMLFormElement>) => void;
};

function SelectedDateModal({
  selectedDate,
  selectedTasks,
  highlightedTaskKey,
  calendarQuickTitle,
  closeButtonRef,
  onClose,
  onOpenTask,
  onQuickTitleChange,
  onAddTask,
}: SelectedDateModalProps) {
  const selectedDateLabel = `${selectedDate} 일정`;

  return (
    <div className="selected-date-modal-layer" role="presentation">
      <button className="modal-backdrop" aria-label="배경 클릭으로 닫기" onClick={onClose} type="button" />
      <section className="selected-date-modal" role="dialog" aria-modal="true" aria-label={selectedDateLabel}>
        <div className="selected-date-modal-header">
          <h2>{selectedDateLabel}</h2>
          <button ref={closeButtonRef} className="modal-close" aria-label="선택 날짜 닫기" onClick={onClose} type="button">
            ×
          </button>
        </div>
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
            {selectedTasks.map((task) => {
              const taskKey = `${task.id}:${task.occurrenceDate}`;
              const isHighlighted = taskKey === highlightedTaskKey;
              return (
                <li className={isHighlighted ? 'notification-highlight' : ''} key={taskKey}>
                  <button data-testid={isHighlighted ? 'notification-highlighted-task' : undefined} onClick={() => onOpenTask(task)} type="button">
                    {task.time ? `${task.time} ` : ''}
                    {task.title}
                  </button>
                </li>
              );
            })}
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
  themeColor: ThemeColor;
  themeMode: ThemeMode;
  settingsRecurringForm: TaskFormState;
  settingsRecurringStatus: string;
  onReminderSettingsChange: (settings: ReminderSettings) => void;
  onThemeColorChange: (themeColor: ThemeColor) => void;
  onThemeModeChange: (themeMode: ThemeMode) => void;
  onSettingsRecurringFormChange: (form: TaskFormState) => void;
  onSettingsRecurringSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTestNotification: () => void;
};

function SettingsPanel({
  reminderSettings,
  notificationPermission,
  testNotificationMessage,
  themeColor,
  themeMode,
  settingsRecurringForm,
  settingsRecurringStatus,
  onReminderSettingsChange,
  onThemeColorChange,
  onThemeModeChange,
  onSettingsRecurringFormChange,
  onSettingsRecurringSubmit,
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

      <section className="settings-card" aria-label="반복 할 일 설정">
        <h2>반복 할 일</h2>
        <p className="settings-help">매일/매주/매월 반복되는 가벼운 할 일을 Settings에서 바로 추가합니다.</p>
        <form className="settings-recurring-form" onSubmit={onSettingsRecurringSubmit}>
          <label>
            반복 할 일 제목
            <input
              required
              value={settingsRecurringForm.title}
              onChange={(event) => onSettingsRecurringFormChange({ ...settingsRecurringForm, title: event.target.value })}
              placeholder="예: 스트레칭"
            />
          </label>
          <label>
            반복 시작 날짜
            <input
              required
              type="date"
              value={settingsRecurringForm.date}
              onChange={(event) => onSettingsRecurringFormChange({ ...settingsRecurringForm, date: event.target.value })}
            />
          </label>
          <label>
            반복 할 일 시간
            <input
              type="time"
              value={settingsRecurringForm.time}
              onChange={(event) => onSettingsRecurringFormChange({ ...settingsRecurringForm, time: event.target.value })}
            />
          </label>
          <label>
            반복 주기
            <select
              value={settingsRecurringForm.recurrence}
              onChange={(event) => onSettingsRecurringFormChange({ ...settingsRecurringForm, recurrence: event.target.value as Recurrence })}
            >
              {(['daily', 'weekly', 'monthly'] as Recurrence[]).map((value) => (
                <option key={value} value={value}>
                  {recurrenceLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            반복 할 일 메모
            <textarea
              value={settingsRecurringForm.memo}
              onChange={(event) => onSettingsRecurringFormChange({ ...settingsRecurringForm, memo: event.target.value })}
            />
          </label>
          <label className="checkbox-row">
            <input
              checked={settingsRecurringForm.notify}
              onChange={(event) => onSettingsRecurringFormChange({ ...settingsRecurringForm, notify: event.target.checked })}
              type="checkbox"
            />
            알림 켜기
          </label>
          <button type="submit">반복 할 일 추가</button>
        </form>
        {settingsRecurringStatus ? (
          <p className="notification-feedback" role="status">
            {settingsRecurringStatus}
          </p>
        ) : null}
      </section>

      <section className="settings-card" aria-label="테마 설정">
        <h2>테마</h2>
        <label>
          테마 색상
          <select value={themeColor} onChange={(event) => onThemeColorChange(event.target.value as ThemeColor)}>
            {themeColorOptions.map((option) => (
              <option key={option} value={option}>
                {themeColorLabels[option]}
              </option>
            ))}
          </select>
        </label>
        <label>
          화면 모드
          <select value={themeMode} onChange={(event) => onThemeModeChange(event.target.value as ThemeMode)}>
            {themeModeOptions.map((option) => (
              <option key={option} value={option}>
                {themeModeLabels[option]}
              </option>
            ))}
          </select>
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
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [task.id, task.occurrenceDate]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div aria-modal="true" className="modal-backdrop" onKeyDown={handleKeyDown} role="dialog" aria-label={`${task.title} 상세`}>
      <form className="task-modal" onSubmit={onSave}>
        <div className="modal-header">
          <h2>할 일 상세</h2>
          <button ref={closeButtonRef} aria-label="닫기" onClick={onClose} type="button">
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
