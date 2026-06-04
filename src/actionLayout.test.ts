import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/styles.css', 'utf8');

describe('notification action layout styles', () => {
  it('keeps notification and evening review quick actions in a single four-column row', () => {
    expect(styles).toMatch(/\.notification-entry-actions,\s*\.evening-review-actions\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  });
});
