import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../src/App';

describe('production app shell smoke flow', () => {
  it('starts on Today and can navigate through all bottom tabs', async () => {
    const user = userEvent.setup();
    render(<App />);

    const activePanel = screen.getByRole('region', { name: '활성 탭 화면' });
    expect(screen.getByRole('tab', { name: '오늘' })).toHaveAttribute('aria-selected', 'true');
    expect(activePanel).toHaveAttribute('data-active-tab', 'today');
    expect(activePanel).toHaveAttribute('data-scroll-mode', 'internal');

    await user.click(screen.getByRole('tab', { name: '캘린더' }));
    expect(screen.getByRole('tab', { name: '캘린더' })).toHaveAttribute('aria-selected', 'true');
    expect(activePanel).toHaveAttribute('data-active-tab', 'calendar');
    expect(activePanel).toHaveAttribute('data-scroll-mode', 'internal');
    expect(screen.getByLabelText('연도 선택')).toBeInTheDocument();
    expect(screen.getByLabelText('월 선택')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '설정' }));
    expect(screen.getByRole('tab', { name: '설정' })).toHaveAttribute('aria-selected', 'true');
    expect(activePanel).toHaveAttribute('data-active-tab', 'settings');
    expect(activePanel).toHaveAttribute('data-scroll-mode', 'scroll');
    expect(screen.getByLabelText('아침 알림 시간')).toBeInTheDocument();
    expect(screen.getByLabelText('저녁 리뷰 시간')).toBeInTheDocument();
  });
});
