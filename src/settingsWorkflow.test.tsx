import { render, screen } from '@testing-library/react';
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
