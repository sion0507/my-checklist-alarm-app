import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { clearTaskStoreForTests, createTask, listTasks } from './taskStore';

const styles = readFileSync('src/styles.css', 'utf8');

function zIndexForClass(className: string) {
  const matches = [...styles.matchAll(new RegExp(`\\.${className}\\s*\\{[^}]*z-index:\\s*(\\d+)`, 'gs'))];
  const match = matches.at(-1);
  return match ? Number(match[1]) : NaN;
}

describe('Calendar month view workflow', () => {
  beforeEach(async () => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    await clearTaskStoreForTests();
  });

  it('renders month grid, task pills, overflow, and opens task detail from a pill', async () => {
    const user = userEvent.setup();
    await createTask({ title: '병원 예약 아주 긴 제목입니다', date: '2026-06-10', time: '09:30', recurrence: 'none', memo: '', notify: false });
    await createTask({ title: '주간 회고', date: '2026-06-03', time: '', recurrence: 'weekly', memo: '', notify: false });
    await createTask({ title: '세 번째 일정', date: '2026-06-10', time: '', recurrence: 'none', memo: '', notify: false });

    render(<App initialCalendarDate={new Date(2026, 5, 1)} />);
    await user.click(screen.getByRole('tab', { name: /캘린더/ }));

    expect(screen.queryByText(/Month view/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('연도 선택')).toHaveValue('2026');
    expect(screen.getByLabelText('월 선택')).toHaveValue('5');
    expect(screen.getByRole('columnheader', { name: 'Sun' })).toBeInTheDocument();
    expect(screen.getAllByTestId('calendar-day-cell')).toHaveLength(42);

    const june10 = screen.getByRole('button', { name: /2026-06-10/ });
    expect(within(june10).getByText('09:30 병원 예약 아주 긴 제목입니다')).toBeInTheDocument();
    expect(within(june10).getAllByRole('button', { name: /상세 열기/ })).toHaveLength(2);
    expect(within(june10).getByText('+1 more')).toBeInTheDocument();

    await user.click(within(june10).getByRole('button', { name: /병원 예약 아주 긴 제목입니다 상세 열기/ }));
    expect(await screen.findByRole('dialog', { name: /병원 예약 아주 긴 제목입니다 상세/ })).toBeInTheDocument();
  });

  it('marks calendar task pills with accessible type colors and a non-color legend', async () => {
    await createTask({ title: '기본 색상', date: '2026-06-10', time: '', recurrence: 'none', memo: '', notify: false, creationType: 'single' });
    await createTask({ title: '기간 색상', date: '2026-06-10', time: '', recurrence: 'none', memo: '', notify: false, creationType: 'range' });
    await createTask({ title: '반복 색상', date: '2026-06-11', time: '', recurrence: 'weekly', memo: '', notify: false, creationType: 'repeat' });
    await createTask({ title: '다중 색상', date: '2026-06-11', time: '', recurrence: 'none', memo: '', notify: false, creationType: 'multi' });

    render(<App initialCalendarDate={new Date(2026, 5, 1)} />);
    fireEvent.click(screen.getByRole('tab', { name: /캘린더/ }));

    const legend = screen.getByRole('list', { name: '캘린더 할 일 유형 범례' });
    expect(within(legend).getByText('기본').closest('li')).toHaveClass('task-type-legend-single');
    expect(within(legend).getByText('기간').closest('li')).toHaveClass('task-type-legend-range');
    expect(within(legend).getByText('반복').closest('li')).toHaveClass('task-type-legend-repeat');
    expect(within(legend).getByText('다중').closest('li')).toHaveClass('task-type-legend-multi');

    const june10 = screen.getByRole('button', { name: /2026-06-10/ });
    const basicPill = await within(june10).findByRole('button', { name: '기본 색상 상세 열기' });
    const rangePill = within(june10).getByRole('button', { name: '기간 색상 상세 열기' });
    expect(basicPill).toHaveClass('task-pill-single');
    expect(rangePill).toHaveClass('task-pill-range');
    expect(within(basicPill).getByText('●')).toHaveAttribute('aria-hidden', 'true');
    expect(within(rangePill).getByText('◆')).toHaveAttribute('aria-hidden', 'true');

    const june11 = screen.getByRole('button', { name: /2026-06-11/ });
    const repeatPill = within(june11).getByRole('button', { name: '반복 색상 상세 열기' });
    const multiPill = within(june11).getByRole('button', { name: '다중 색상 상세 열기' });
    expect(repeatPill).toHaveClass('task-pill-repeat');
    expect(multiPill).toHaveClass('task-pill-multi');
  });

  it('keeps task type colors explicit and high-contrast across light and dark theme variables', () => {
    const expectedVariables = [
      '--task-type-single-bg: #dbeafe',
      '--task-type-single-text: #1e3a8a',
      '--task-type-range-bg: #dcfce7',
      '--task-type-range-text: #14532d',
      '--task-type-repeat-bg: #fef3c7',
      '--task-type-repeat-text: #713f12',
      '--task-type-multi-bg: #fee2e2',
      '--task-type-multi-text: #7f1d1d',
    ];
    for (const variable of expectedVariables) {
      expect(styles).toContain(variable);
    }
    expect(styles).toMatch(/\[data-theme-mode='dark'\][^{]*\{[^}]*--task-type-single-bg:\s*#1e3a8a[^}]*--task-type-single-text:\s*#dbeafe/s);
    expect(styles).toMatch(/\[data-theme-mode='dark'\][^{]*\{[^}]*--task-type-range-bg:\s*#14532d[^}]*--task-type-range-text:\s*#dcfce7/s);
    expect(styles).toMatch(/\[data-theme-mode='dark'\][^{]*\{[^}]*--task-type-repeat-bg:\s*#713f12[^}]*--task-type-repeat-text:\s*#fef3c7/s);
    expect(styles).toMatch(/\[data-theme-mode='dark'\][^{]*\{[^}]*--task-type-multi-bg:\s*#7f1d1d[^}]*--task-type-multi-text:\s*#fee2e2/s);
  });

  it('opens task detail above the selected-date modal and routes focus to the detail panel', async () => {
    await createTask({ title: '선택 날짜 상세 할 일', date: '2026-06-12', time: '', recurrence: 'none', memo: '', notify: false });
    render(<App initialCalendarDate={new Date(2026, 5, 1)} />);
    fireEvent.click(screen.getByRole('tab', { name: /캘린더/ }));

    const dateButton = screen.getByRole('button', { name: /2026-06-12/ });
    await waitFor(() => expect(within(dateButton).getByText('선택 날짜 상세 할 일')).toBeInTheDocument());
    fireEvent.click(dateButton);
    const selectedDateDialog = await screen.findByRole('dialog', { name: '2026-06-12 일정' });
    fireEvent.click(within(selectedDateDialog).getByRole('button', { name: '선택 날짜 상세 할 일' }));

    const taskDetailDialog = await screen.findByRole('dialog', { name: /선택 날짜 상세 할 일 상세/ });
    expect(zIndexForClass('modal-backdrop')).toBeGreaterThan(zIndexForClass('selected-date-modal-layer'));
    expect(within(taskDetailDialog).getByRole('button', { name: '닫기' })).toHaveFocus();
  });

  it('routes Escape to the topmost task detail before the selected-date modal', async () => {
    await createTask({ title: 'Escape 라우팅 할 일', date: '2026-06-12', time: '', recurrence: 'none', memo: '', notify: false });
    render(<App initialCalendarDate={new Date(2026, 5, 1)} />);
    fireEvent.click(screen.getByRole('tab', { name: /캘린더/ }));

    const dateButton = screen.getByRole('button', { name: /2026-06-12/ });
    await waitFor(() => expect(within(dateButton).getByText('Escape 라우팅 할 일')).toBeInTheDocument());
    fireEvent.click(dateButton);
    const selectedDateDialog = await screen.findByRole('dialog', { name: '2026-06-12 일정' });
    fireEvent.click(within(selectedDateDialog).getByRole('button', { name: 'Escape 라우팅 할 일' }));
    const taskDetailDialog = await screen.findByRole('dialog', { name: /Escape 라우팅 할 일 상세/ });

    fireEvent.keyDown(within(taskDetailDialog).getByRole('button', { name: '닫기' }), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Escape 라우팅 할 일 상세/ })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: '2026-06-12 일정' })).toBeInTheDocument();
  });

  it('opens selected-date tasks in a dismissible modal and keeps add flow tied to that date', async () => {
    await createTask({ title: '선택 날짜 기존 할 일', date: '2026-06-12', time: '', recurrence: 'none', memo: '', notify: false });
    render(<App initialCalendarDate={new Date(2026, 5, 1)} />);
    fireEvent.click(screen.getByRole('tab', { name: /캘린더/ }));

    const dateButton = screen.getByRole('button', { name: /2026-06-12/ });
    await waitFor(() => expect(within(dateButton).getByText('선택 날짜 기존 할 일')).toBeInTheDocument());
    fireEvent.click(dateButton);
    const dialog = await screen.findByRole('dialog', { name: '2026-06-12 일정' });
    expect(screen.getByRole('button', { name: '선택 날짜 닫기' })).toHaveFocus();
    expect(within(dialog).getByText('선택 날짜 기존 할 일')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '선택 날짜 일정' })).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('선택한 날짜에 할 일 추가'), { target: { value: '선택 날짜 할 일' } });
    fireEvent.submit(within(dialog).getByRole('button', { name: '날짜에 추가' }).closest('form')!);
    expect(await within(dialog).findByText('선택 날짜 할 일')).toBeInTheDocument();
    await waitFor(async () => {
      expect(await listTasks()).toEqual(expect.arrayContaining([expect.objectContaining({ title: '선택 날짜 할 일', date: '2026-06-12' })]));
    });

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '2026-06-12 일정' })).not.toBeInTheDocument());
    await waitFor(() => expect(dateButton).toHaveFocus());

    fireEvent.click(dateButton);
    fireEvent.click(await screen.findByRole('button', { name: '선택 날짜 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '2026-06-12 일정' })).not.toBeInTheDocument());

    fireEvent.click(dateButton);
    fireEvent.click(await screen.findByRole('button', { name: '배경 클릭으로 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '2026-06-12 일정' })).not.toBeInTheDocument());
  });

  it('limits calendar year selection and navigation to the supported Korean holiday data range', async () => {
    const user = userEvent.setup();
    render(<App initialCalendarDate={new Date(2026, 0, 1)} />);
    await user.click(screen.getByRole('tab', { name: /캘린더/ }));

    expect(screen.getByLabelText('연도 선택')).toHaveValue('2026');
    expect(screen.getByLabelText('연도 선택')).not.toHaveTextContent('2025');
    expect(screen.queryByRole('button', { name: '이전 달' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /2025-12-31/ }));
    expect(screen.queryByRole('dialog', { name: '2025-12-31 일정' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('연도 선택'), { target: { value: '2032' } });
    fireEvent.change(screen.getByLabelText('월 선택'), { target: { value: '11' } });

    expect(screen.getByLabelText('연도 선택')).toHaveValue('2032');
    expect(screen.getByLabelText('연도 선택')).not.toHaveTextContent('2033');
    fireEvent.click(screen.getByRole('button', { name: /2033-01-01/ }));
    expect(screen.queryByRole('dialog', { name: '2033-01-01 일정' })).not.toBeInTheDocument();
  });

  it('creates calendar tasks through image-style sheet tabs for basic, range, multiple, and weekly repeat flows', async () => {
    const user = userEvent.setup();
    render(<App initialCalendarDate={new Date(2026, 5, 9)} />);
    await user.click(screen.getByRole('tab', { name: /캘린더/ }));
    await user.click(screen.getByRole('button', { name: '캘린더에서 할 일 만들기' }));

    const sheet = await screen.findByRole('dialog', { name: '캘린더 할 일 생성' });
    expect(sheet).toHaveAttribute('data-calendar-create-sheet', 'true');
    expect(within(sheet).getByTestId('calendar-sheet-handle')).toBeInTheDocument();
    const cancelButton = within(sheet).getByRole('button', { name: '캘린더 생성 취소' });
    expect(cancelButton).toHaveClass('sheet-cancel-button');
    expect(cancelButton).toHaveTextContent('×');
    expect(cancelButton).not.toHaveTextContent('🗓');
    expect(within(sheet).getByRole('button', { name: '캘린더 생성 저장' })).toHaveClass('sheet-save-button');
    expect(within(sheet).getByRole('tab', { name: '일반' })).toHaveClass('active');

    fireEvent.change(within(sheet).getByLabelText('캘린더 생성 제목'), { target: { value: '일반 생성' } });
    await user.click(within(sheet).getByRole('button', { name: /2026-06-09/ }));
    await user.click(within(sheet).getByRole('button', { name: '캘린더 생성 저장' }));

    await waitFor(async () => expect(await listTasks()).toEqual(expect.arrayContaining([expect.objectContaining({ title: '일반 생성', date: '2026-06-09', recurrence: 'none' })])));
    expect(await within(screen.getByRole('button', { name: /2026-06-09/ })).findByText('일반 생성')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '캘린더에서 할 일 만들기' }));
    const rangeSheet = await screen.findByRole('dialog', { name: '캘린더 할 일 생성' });
    await user.click(within(rangeSheet).getByRole('tab', { name: '기간' }));
    fireEvent.change(within(rangeSheet).getByLabelText('캘린더 생성 제목'), { target: { value: '기간 생성' } });
    await user.click(within(rangeSheet).getByRole('button', { name: /2026-06-10/ }));
    await user.click(within(rangeSheet).getByRole('button', { name: /2026-06-12/ }));
    expect(within(rangeSheet).getByRole('button', { name: /2026-06-10/ })).toHaveClass('range-endpoint');
    expect(within(rangeSheet).getByRole('button', { name: /2026-06-11/ })).toHaveClass('in-range');
    await user.click(within(rangeSheet).getByRole('button', { name: '캘린더 생성 저장' }));

    await waitFor(async () => {
      const tasks = await listTasks();
      expect(tasks).toEqual(expect.arrayContaining([
        expect.objectContaining({ title: '기간 생성', date: '2026-06-10' }),
        expect.objectContaining({ title: '기간 생성', date: '2026-06-11' }),
        expect.objectContaining({ title: '기간 생성', date: '2026-06-12' }),
      ]));
    });

    await user.click(screen.getByRole('button', { name: '캘린더에서 할 일 만들기' }));
    const multiSheet = await screen.findByRole('dialog', { name: '캘린더 할 일 생성' });
    await user.click(within(multiSheet).getByRole('tab', { name: '다중' }));
    fireEvent.change(within(multiSheet).getByLabelText('캘린더 생성 제목'), { target: { value: '다중 생성' } });
    await user.click(within(multiSheet).getByRole('button', { name: /2026-06-09/ }));
    await user.click(within(multiSheet).getByRole('button', { name: /2026-06-11/ }));
    await user.click(within(multiSheet).getByRole('button', { name: /2026-06-13/ }));
    expect(within(multiSheet).getByRole('button', { name: /2026-06-11/ })).toHaveClass('multi-selected');
    await user.click(within(multiSheet).getByRole('button', { name: '캘린더 생성 저장' }));

    await user.click(screen.getByRole('button', { name: '캘린더에서 할 일 만들기' }));
    const repeatSheet = await screen.findByRole('dialog', { name: '캘린더 할 일 생성' });
    await user.click(within(repeatSheet).getByRole('tab', { name: '반복' }));
    expect(within(repeatSheet).getByLabelText('반복 유형')).toHaveValue('weekly');
    fireEvent.change(within(repeatSheet).getByLabelText('캘린더 생성 제목'), { target: { value: '반복 생성' } });
    await user.click(within(repeatSheet).getByRole('button', { name: '월요일 선택' }));
    await user.click(within(repeatSheet).getByRole('button', { name: '수요일 선택' }));
    expect(within(repeatSheet).getByRole('button', { name: '월요일 선택' })).toHaveClass('selected');
    await user.click(within(repeatSheet).getByRole('button', { name: '캘린더 생성 저장' }));

    await waitFor(async () => {
      const tasks = await listTasks();
      expect(tasks).toEqual(expect.arrayContaining([
        expect.objectContaining({ title: '다중 생성', date: '2026-06-09' }),
        expect.objectContaining({ title: '다중 생성', date: '2026-06-11' }),
        expect.objectContaining({ title: '다중 생성', date: '2026-06-13' }),
        expect.objectContaining({ title: '반복 생성', date: '2026-06-15', recurrence: 'weekly' }),
        expect.objectContaining({ title: '반복 생성', date: '2026-06-17', recurrence: 'weekly' }),
      ]));
    });

    await user.click(screen.getByRole('tab', { name: /오늘/ }));
    expect(await screen.findByRole('checkbox', { name: '일반 생성 완료' })).toBeInTheDocument();
  }, 30000);

  it('creates a calendar sheet task after moving the sheet to another month', async () => {
    const user = userEvent.setup();
    render(<App initialCalendarDate={new Date(2026, 5, 9)} />);
    await user.click(screen.getByRole('tab', { name: /캘린더/ }));
    await user.click(screen.getByRole('button', { name: '캘린더에서 할 일 만들기' }));

    const sheet = await screen.findByRole('dialog', { name: '캘린더 할 일 생성' });
    expect(within(sheet).getByRole('heading', { name: '2026년 6월' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: '다음 생성 월' }));
    expect(within(sheet).getByRole('heading', { name: '2026년 7월' })).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText('캘린더 생성 제목'), { target: { value: '다른 월 생성' } });
    await user.click(within(sheet).getByRole('button', { name: /2026-07-15/ }));
    await user.click(within(sheet).getByRole('button', { name: '캘린더 생성 저장' }));

    await waitFor(async () => {
      expect(await listTasks()).toEqual(expect.arrayContaining([expect.objectContaining({ title: '다른 월 생성', date: '2026-07-15' })]));
    });
    expect(screen.getByLabelText('월 선택')).toHaveValue('6');
    expect(await within(screen.getByRole('button', { name: /2026-07-15/ })).findByText('다른 월 생성')).toBeInTheDocument();
  });

  it('blocks invalid calendar sheet saves for empty range and empty multi selections', async () => {
    const user = userEvent.setup();
    render(<App initialCalendarDate={new Date(2026, 5, 9)} />);
    await user.click(screen.getByRole('tab', { name: /캘린더/ }));

    await user.click(screen.getByRole('button', { name: '캘린더에서 할 일 만들기' }));
    const rangeSheet = await screen.findByRole('dialog', { name: '캘린더 할 일 생성' });
    await user.click(within(rangeSheet).getByRole('tab', { name: '기간' }));
    fireEvent.change(within(rangeSheet).getByLabelText('캘린더 생성 제목'), { target: { value: '날짜 없는 기간' } });
    expect(within(rangeSheet).getByRole('button', { name: '캘린더 생성 저장' })).toBeDisabled();
    await user.click(within(rangeSheet).getByRole('button', { name: '캘린더 생성 저장' }));
    expect(await listTasks()).toEqual([]);
    expect(screen.getByRole('dialog', { name: '캘린더 할 일 생성' })).toBeInTheDocument();

    await user.click(within(rangeSheet).getByRole('button', { name: '캘린더 생성 취소' }));
    await user.click(screen.getByRole('button', { name: '캘린더에서 할 일 만들기' }));
    const multiSheet = await screen.findByRole('dialog', { name: '캘린더 할 일 생성' });
    await user.click(within(multiSheet).getByRole('tab', { name: '다중' }));
    fireEvent.change(within(multiSheet).getByLabelText('캘린더 생성 제목'), { target: { value: '빈 다중' } });
    const june9 = within(multiSheet).getByRole('button', { name: /2026-06-09/ });
    await user.click(june9);
    expect(june9).toHaveClass('multi-selected');
    await user.click(june9);
    expect(june9).not.toHaveClass('multi-selected');
    expect(within(multiSheet).getByRole('button', { name: '캘린더 생성 저장' })).toBeDisabled();
    await user.click(within(multiSheet).getByRole('button', { name: '캘린더 생성 저장' }));
    expect(await listTasks()).toEqual([]);

    await user.click(within(multiSheet).getByRole('tab', { name: '일반' }));
    expect(within(multiSheet).getByRole('button', { name: '캘린더 생성 저장' })).toBeDisabled();
    await user.click(within(multiSheet).getByRole('button', { name: '캘린더 생성 저장' }));
    expect(await listTasks()).toEqual([]);
    expect(screen.getByRole('dialog', { name: '캘린더 할 일 생성' })).toBeInTheDocument();
  });

  it('keeps the calendar creation sheet visually aligned to the mobile reference', () => {
    expect(styles).toMatch(/\.calendar-create-sheet\s*\{[^}]*border-radius:\s*36px 36px 0 0/s);
    expect(styles).toMatch(/\.calendar-sheet-handle\s*\{[^}]*width:\s*56px/s);
    expect(styles).toMatch(/\.sheet-cancel-button\s*\{[^}]*color:\s*#ef4444/s);
    expect(styles).toMatch(/\.sheet-save-button\s*\{[^}]*color:\s*#7aa7f8/s);
    expect(styles).toMatch(/\.calendar-create-tab\.active\s*\{[^}]*background:\s*#ffffff/s);
    expect(styles).toMatch(/\.range-endpoint[^}]*\{[^}]*border-radius:\s*999px/s);
    expect(styles).toMatch(/\.in-range[^}]*\{[^}]*background:\s*#dcecff/s);
    expect(styles).toMatch(/\.repeat-weekday-pill\.selected\s*\{[^}]*border-radius:\s*999px/s);
  });
});
