import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/styles.css', 'utf8');

describe('notification action layout styles', () => {
  it('keeps notification and evening review quick actions in a single four-column row', () => {
    expect(styles).toMatch(/\.notification-entry-actions,\s*\.evening-review-actions\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  });

  it('keeps Today overflow inside the task list without re-enabling page scroll', () => {
    expect(styles).toMatch(/html,\s*body,\s*#root\s*\{[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(/\.app-shell\s*\{[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(/\.phone-frame\s*\{[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(/\.content-card\[data-active-tab='today'\]\[data-scroll-mode='internal'\]\s*\{[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(/\.today-panel\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*min-height:\s*0/s);
    expect(styles).toMatch(/\.today-panel\s+\.task-list\s*\{[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/s);
  });
});
