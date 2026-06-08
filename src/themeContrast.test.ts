import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/styles.css', 'utf8');

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`));
  return match?.groups?.body ?? '';
}

describe('theme contrast CSS', () => {
  it('keeps dark-mode morning, evening, and warning surfaces on dark-safe tokens', () => {
    const darkTheme = cssRule(".app-shell[data-theme-mode='dark']");

    expect(darkTheme).toContain('--theme-morning-surface: #3a2b12;');
    expect(darkTheme).toContain('--theme-evening-surface: #31264d;');
    expect(darkTheme).toContain('--theme-warning-surface: #431f13;');
    expect(darkTheme).toContain('--theme-info-surface: #12364a;');
    expect(darkTheme).toContain('--theme-success-surface: #14351f;');
    expect(darkTheme).toContain('--theme-holiday-text: #facc15;');
    expect(darkTheme).toContain('--theme-anniversary-text: #f9a8d4;');
  });

  it('uses theme tokens for holiday and anniversary marker colors', () => {
    expect(cssRule('.date-marker')).toContain('color: var(--theme-holiday-text);');
    expect(cssRule('.marker-anniversary .date-marker')).toContain('color: var(--theme-anniversary-text);');
  });

  it('colors public holiday day numbers red even when they fall on weekdays', () => {
    expect(cssRule('.calendar-day.marker-holiday .day-number')).toContain('color: #ef4444;');
  });

  it('uses theme tokens for remaining card and status backgrounds instead of hardcoded light surfaces', () => {
    const themedSelectors = [
      '.morning-check-in',
      '.evening-review-card',
      '.evening-review-list li',
      '.permission-pill',
      '.permission-granted',
      '.permission-denied,\n.storage-warning',
      '.permission-unsupported',
    ];

    for (const selector of themedSelectors) {
      const rule = cssRule(selector);
      expect(rule).not.toMatch(/background:\s*(#fff|#fef3c7|#dbeafe|#ede9fe|rgba\(255, 255, 255)/);
    }
  });
});
