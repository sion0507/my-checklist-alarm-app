import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('PWA app shell', () => {
  it('opens without duplicate tab title or helper copy above the panels', () => {
    render(<App />);

    expect(screen.getByText('Checklist Alarm')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '오늘' })).not.toBeInTheDocument();
    expect(screen.queryByText('오늘 해야 할 일을 가장 먼저 보여주는 기본 화면입니다.')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '오늘' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '캘린더' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '설정' })).toBeInTheDocument();
  });

  it('marks Calendar for fixed-frame internal overflow and Settings for direct scrolling', async () => {
    const user = userEvent.setup();
    render(<App />);

    const contentCard = screen.getByLabelText('활성 탭 화면');
    expect(contentCard).toHaveAttribute('data-scroll-mode', 'fixed');

    await user.click(screen.getByRole('tab', { name: '캘린더' }));
    expect(screen.queryByRole('heading', { name: '캘린더' })).not.toBeInTheDocument();
    expect(screen.queryByText('월간 일정과 할 일 분포를 확인할 공간입니다.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Month view/i)).not.toBeInTheDocument();
    expect(contentCard).toHaveAttribute('data-active-tab', 'calendar');
    expect(contentCard).toHaveAttribute('data-scroll-mode', 'internal');
    expect(screen.getByLabelText('연도 선택')).toBeInTheDocument();
    expect(screen.getByLabelText('월 선택')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '캘린더' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: '설정' }));
    expect(screen.queryByRole('heading', { name: '설정' })).not.toBeInTheDocument();
    expect(screen.queryByText('아침/저녁 알림 시간과 PWA 알림 상태를 설정할 공간입니다.')).not.toBeInTheDocument();
    expect(contentCard).toHaveAttribute('data-scroll-mode', 'scroll');
    expect(screen.getByRole('tab', { name: '설정' })).toHaveAttribute('aria-selected', 'true');
  });
});
