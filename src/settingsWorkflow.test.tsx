import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { clearTaskStoreForTests } from './taskStore';

function stubNotification(permission: NotificationPermission, requestResult = permission) {
  const requestPermission = vi.fn().mockResolvedValue(requestResult);
  vi.stubGlobal('Notification', { permission, requestPermission });
  return { requestPermission };
}

function stubServiceWorker() {
  const subscribe = vi.fn().mockResolvedValue({
    endpoint: 'https://push.example/settings-device',
    toJSON: () => ({
      endpoint: 'https://push.example/settings-device',
      keys: { p256dh: 'settings-public-key', auth: 'settings-auth-secret' },
    }),
  });
  const registration = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe,
    },
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve(registration),
      register: vi.fn().mockResolvedValue(registration),
    },
  });
  return { subscribe };
}

function stubPushBackend() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/vapid-public-key')) {
      return new Response(JSON.stringify({ publicKey: 'BElAQID' }), { status: 200 });
    }
    if (url.endsWith('/subscriptions')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.endsWith('/schedule')) {
      return new Response(JSON.stringify({ ok: true, upserted: 14, cancelled: 0 }), { status: 200 });
    }
    if (url.endsWith('/test')) {
      return new Response(JSON.stringify({ ok: true, status: 201 }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Settings reminders workflow', () => {
  beforeEach(async () => {
    await clearTaskStoreForTests();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows reminder defaults, notification status, test control, and data loss warning', async () => {
    stubNotification('default');
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('tab', { name: '설정' }));

    expect(screen.getByLabelText('아침 알림 시간')).toHaveValue('08:00');
    expect(screen.getByLabelText('저녁 리뷰 시간')).toHaveValue('23:00');
    expect(screen.getByText('알림 권한: 권한 요청 필요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '테스트 알림 보내기' })).toBeInTheDocument();
    expect(screen.getByText(/브라우저 또는 PWA 저장소를 삭제하면/)).toBeInTheDocument();
  });

  it('persists reminder time changes across remounts', async () => {
    stubNotification('denied');
    const user = userEvent.setup();
    const firstRender = render(<App />);
    await user.click(screen.getByRole('tab', { name: '설정' }));

    await user.clear(screen.getByLabelText('아침 알림 시간'));
    await user.type(screen.getByLabelText('아침 알림 시간'), '07:30');
    await user.clear(screen.getByLabelText('저녁 리뷰 시간'));
    await user.type(screen.getByLabelText('저녁 리뷰 시간'), '22:15');

    firstRender.unmount();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: '설정' }));

    expect(screen.getByLabelText('아침 알림 시간')).toHaveValue('07:30');
    expect(screen.getByLabelText('저녁 리뷰 시간')).toHaveValue('22:15');
    expect(screen.getByText('알림 권한: 차단됨')).toBeInTheDocument();
  });

  it('applies and persists theme color and light/dark mode selections', async () => {
    stubNotification('default');
    const user = userEvent.setup();
    const firstRender = render(<App />);
    const appShell = screen.getByLabelText('Checklist Alarm PWA');

    expect(appShell).toHaveAttribute('data-theme-color', 'blue');
    expect(appShell).toHaveAttribute('data-theme-mode', 'light');
    await user.click(screen.getByRole('tab', { name: '설정' }));
    expect(screen.getByLabelText('테마 색상')).toHaveValue('blue');
    expect(screen.getByLabelText('화면 모드')).toHaveValue('light');

    await user.selectOptions(screen.getByLabelText('테마 색상'), 'rose');
    await user.selectOptions(screen.getByLabelText('화면 모드'), 'dark');
    expect(appShell).toHaveAttribute('data-theme-color', 'rose');
    expect(appShell).toHaveAttribute('data-theme-mode', 'dark');
    expect(localStorage.getItem('checklist-alarm:theme-color')).toBe('rose');
    expect(localStorage.getItem('checklist-alarm:theme-mode')).toBe('dark');

    firstRender.unmount();
    render(<App />);
    expect(screen.getByLabelText('Checklist Alarm PWA')).toHaveAttribute('data-theme-color', 'rose');
    expect(screen.getByLabelText('Checklist Alarm PWA')).toHaveAttribute('data-theme-mode', 'dark');
    await user.click(screen.getByRole('tab', { name: '설정' }));
    expect(screen.getByLabelText('테마 색상')).toHaveValue('rose');
    expect(screen.getByLabelText('화면 모드')).toHaveValue('dark');
  });

  it('creates a recurring task rule from Settings and projects it into Today and Calendar', async () => {
    stubNotification('default');
    const user = userEvent.setup();

    render(<App initialCalendarDate={new Date(2026, 5, 1)} />);
    await user.click(screen.getByRole('tab', { name: '설정' }));

    expect(screen.getByRole('region', { name: '반복 할 일 설정' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('반복 할 일 제목'), '매일 스트레칭');
    fireEvent.change(screen.getByLabelText('반복 시작 날짜'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('반복 할 일 시간'), { target: { value: '07:00' } });
    await user.selectOptions(screen.getByLabelText('반복 주기'), 'daily');
    await user.click(screen.getByRole('button', { name: '반복 할 일 추가' }));

    expect(await screen.findByRole('status')).toHaveTextContent('매일 스트레칭 반복 할 일을 추가했습니다.');
    await user.click(screen.getByRole('tab', { name: '오늘' }));
    expect(await screen.findByText('매일 스트레칭')).toBeInTheDocument();
    expect(screen.getByText('07:00')).toBeInTheDocument();
    expect(screen.getByText('매일')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '캘린더' }));
    const june2 = screen.getByRole('button', { name: /2026-06-02/ });
    expect(await within(june2).findByText('07:00 매일 스트레칭')).toBeInTheDocument();
  });

  it('uses the backend push test notification flow when permission is granted', async () => {
    stubNotification('granted');
    const { subscribe } = stubServiceWorker();
    const fetchMock = stubPushBackend();
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('tab', { name: '설정' }));
    await user.click(screen.getByRole('button', { name: '테스트 알림 보내기' }));

    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    expect(fetchMock).toHaveBeenCalledWith('/api/push/subscriptions', expect.objectContaining({ method: 'PUT' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/push/schedule', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/push/test', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByRole('status')).toHaveTextContent('백엔드를 통해 테스트 푸시를 요청했습니다.');
  });
});
