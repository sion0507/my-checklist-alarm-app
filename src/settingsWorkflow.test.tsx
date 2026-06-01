import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { clearTaskStoreForTests } from './taskStore';

function stubNotification(permission: NotificationPermission, notificationMock = vi.fn()) {
  const requestPermission = vi.fn().mockResolvedValue(permission);
  const NotificationStub = vi.fn(function NotificationMock(this: unknown, title: string, options?: NotificationOptions) {
    notificationMock(title, options);
    return this;
  });
  Object.assign(NotificationStub, { permission, requestPermission });
  vi.stubGlobal('Notification', NotificationStub);
  return { NotificationStub, requestPermission, notificationMock };
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

  it('uses the test notification control when permission is granted', async () => {
    const { NotificationStub } = stubNotification('granted');
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('tab', { name: '설정' }));
    await user.click(screen.getByRole('button', { name: '테스트 알림 보내기' }));

    expect(NotificationStub).toHaveBeenCalledWith('Checklist Alarm 테스트', expect.objectContaining({ body: '알림 설정이 동작합니다.' }));
    expect(screen.getByRole('status')).toHaveTextContent('테스트 알림을 보냈습니다.');
  });
});
