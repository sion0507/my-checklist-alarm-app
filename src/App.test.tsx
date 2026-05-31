import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('PWA app shell', () => {
  it('opens to Today and exposes the primary iPhone bottom tabs', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '오늘' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '오늘' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '캘린더' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '설정' })).toBeInTheDocument();
  });

  it('navigates between Calendar and Settings tabs', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: '캘린더' }));
    expect(screen.getByRole('heading', { name: '캘린더' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '캘린더' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: '설정' }));
    expect(screen.getByRole('heading', { name: '설정' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '설정' })).toHaveAttribute('aria-selected', 'true');
  });
});
