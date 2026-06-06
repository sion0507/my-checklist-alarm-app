import 'fake-indexeddb/auto';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { clearTaskStoreForTests, createTask, listTasks } from './taskStore';

describe('Calendar month view workflow', () => {
  beforeEach(async () => {
    await clearTaskStoreForTests();
  });

  it('renders month grid, task pills, overflow, and opens task detail from a pill', async () => {
    const user = userEvent.setup();
    await createTask({ title: '병원 예약 아주 긴 제목입니다', date: '2026-06-10', time: '09:30', recurrence: 'none', memo: '', notify: false });
    await createTask({ title: '주간 회고', date: '2026-06-03', time: '', recurrence: 'weekly', memo: '', notify: false });
    await createTask({ title: '세 번째 일정', date: '2026-06-10', time: '', recurrence: 'none', memo: '', notify: false });

    render(<App initialCalendarDate={new Date(2026, 5, 1)} />);
    await user.click(screen.getByRole('tab', { name: /캘린더/ }));

    expect(screen.getByRole('heading', { name: 'June 2026' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Sun' })).toBeInTheDocument();
    expect(screen.getAllByTestId('calendar-day-cell')).toHaveLength(42);

    const june10 = screen.getByRole('button', { name: /2026-06-10/ });
    expect(within(june10).getByText('09:30 병원 예약 아주 긴 제목입니다')).toBeInTheDocument();
    expect(within(june10).getAllByRole('button', { name: /상세 열기/ })).toHaveLength(2);
    expect(within(june10).getByText('+1 more')).toBeInTheDocument();

    await user.click(within(june10).getByRole('button', { name: /병원 예약 아주 긴 제목입니다 상세 열기/ }));
    expect(await screen.findByRole('dialog', { name: /병원 예약 아주 긴 제목입니다 상세/ })).toBeInTheDocument();
  });

  it('opens selected-date tasks in a dismissible modal and keeps add flow tied to that date', async () => {
    const user = userEvent.setup();
    await createTask({ title: '선택 날짜 기존 할 일', date: '2026-06-12', time: '', recurrence: 'none', memo: '', notify: false });
    render(<App initialCalendarDate={new Date(2026, 5, 1)} />);
    await user.click(screen.getByRole('tab', { name: /캘린더/ }));

    await user.click(screen.getByRole('button', { name: /2026-06-12/ }));
    const dialog = await screen.findByRole('dialog', { name: '2026-06-12 일정' });
    expect(within(dialog).getByText('선택 날짜 기존 할 일')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '선택 날짜 일정' })).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('선택한 날짜에 할 일 추가'), '선택 날짜 할 일');
    await user.click(within(dialog).getByRole('button', { name: '날짜에 추가' }));
    expect(await within(dialog).findByText('선택 날짜 할 일')).toBeInTheDocument();
    expect(await listTasks()).toEqual(expect.arrayContaining([expect.objectContaining({ title: '선택 날짜 할 일', date: '2026-06-12' })]));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '2026-06-12 일정' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /2026-06-12/ }));
    await user.click(await screen.findByRole('button', { name: '선택 날짜 닫기' }));
    expect(screen.queryByRole('dialog', { name: '2026-06-12 일정' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /2026-06-12/ }));
    await user.click(await screen.findByRole('button', { name: '배경 클릭으로 닫기' }));
    expect(screen.queryByRole('dialog', { name: '2026-06-12 일정' })).not.toBeInTheDocument();
  });

  it('limits calendar year selection and navigation to 2026 or later', async () => {
    const user = userEvent.setup();
    render(<App initialCalendarDate={new Date(2026, 0, 1)} />);
    await user.click(screen.getByRole('tab', { name: /캘린더/ }));

    expect(screen.getByRole('heading', { name: 'January 2026' })).toBeInTheDocument();
    expect(screen.getByLabelText('연도 선택')).not.toHaveTextContent('2025');
    expect(screen.getByRole('button', { name: '이전 달' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '이전 달' }));
    expect(screen.getByRole('heading', { name: 'January 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '2026-01-01 일정' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /2025-12-31/ }));
    expect(screen.queryByRole('dialog', { name: '2025-12-31 일정' })).not.toBeInTheDocument();
  });
});
