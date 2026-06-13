import { projectTasksForDate, type Task } from './taskStore';

export type ReminderScheduleSettings = {
  morningTime: string;
  eveningTime: string;
};

export type ScheduledNotificationKind = 'morning' | 'evening' | 'task';

export type ScheduledNotificationJob = {
  jobId: string;
  kind: ScheduledNotificationKind;
  scheduledFor: string;
  metadata: {
    title: string;
    path: string;
    taskId?: string;
    occurrenceDate?: string;
  };
};

export const DEFAULT_NOTIFICATION_SCHEDULE_DAYS = 3;

export type BuildScheduleInput = {
  tasks: Task[];
  settings: ReminderScheduleSettings;
  startDate?: string;
  days?: number;
};

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateString: string, days: number) {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function scheduledAt(date: string, time: string) {
  return `${date}T${time}:00`;
}

function dailyJob(kind: 'morning' | 'evening', date: string, time: string): ScheduledNotificationJob {
  const path = kind === 'morning' ? `/?date=${date}&entry=${kind}&time=${encodeURIComponent(time)}` : `/?date=${date}&entry=${kind}`;
  return {
    jobId: `${kind}:${date}`,
    kind,
    scheduledFor: scheduledAt(date, time),
    metadata: {
      title: kind === 'morning' ? '아침 체크리스트 알림' : '저녁 체크리스트 리뷰',
      path,
    },
  };
}

export function buildUpcomingNotificationSchedule({
  tasks,
  settings,
  startDate = formatLocalDate(new Date()),
  days = DEFAULT_NOTIFICATION_SCHEDULE_DAYS,
}: BuildScheduleInput) {
  const jobs: ScheduledNotificationJob[] = [];
  const horizonDays = Math.max(1, Math.floor(days));

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = addDays(startDate, offset);
    jobs.push(dailyJob('morning', date, settings.morningTime));
    const occurrences = projectTasksForDate(tasks, date);
    if (occurrences.some((occurrence) => !occurrence.completed)) {
      jobs.push(dailyJob('evening', date, settings.eveningTime));
    }

    for (const occurrence of occurrences) {
      if (!occurrence.notify || !occurrence.time || occurrence.completed) {
        continue;
      }

      jobs.push({
        jobId: `task:${occurrence.id}:${occurrence.occurrenceDate}`,
        kind: 'task',
        scheduledFor: scheduledAt(occurrence.date, occurrence.time),
        metadata: {
          taskId: occurrence.id,
          occurrenceDate: occurrence.occurrenceDate,
          title: occurrence.title,
          path: `/?date=${occurrence.date}&taskId=${encodeURIComponent(occurrence.id)}&occurrenceDate=${encodeURIComponent(occurrence.occurrenceDate)}&entry=notification`,
        },
      });
    }
  }

  return jobs.sort((a, b) => {
    const first = a.scheduledFor.localeCompare(b.scheduledFor);
    return first === 0 ? a.jobId.localeCompare(b.jobId) : first;
  });
}

export const buildSevenDayNotificationSchedule = buildUpcomingNotificationSchedule;
