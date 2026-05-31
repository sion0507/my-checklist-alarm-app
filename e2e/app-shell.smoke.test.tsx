import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../src/App';

describe('production app shell smoke flow', () => {
  it('starts on Today and can navigate through all bottom tabs', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { name: '오늘' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '오늘' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: '캘린더' }));
    expect(screen.getByRole('heading', { name: '캘린더' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '설정' }));
    expect(screen.getByRole('heading', { name: '설정' })).toBeInTheDocument();
  });
});
