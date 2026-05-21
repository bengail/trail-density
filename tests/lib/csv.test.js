import { describe, it, expect } from 'vitest';
import { csvCell, rowsToCsv } from '../../lib/csv.js';

describe('csvCell', () => {
  it('wraps value in double quotes', () => {
    expect(csvCell('hello')).toBe('"hello"');
  });

  it('escapes internal double quotes', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('handles null and undefined as empty string', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it('converts numbers to string', () => {
    expect(csvCell(42)).toBe('"42"');
  });
});

describe('rowsToCsv', () => {
  const rows = [
    { name: 'UTMB', country: 'France', series: 'UTMB', rc3: 870.5, rc5: 850.2, rc10: 820.1, rc20: 780.3 },
    { name: 'Zegama', country: 'Spain', series: 'GTWS', rc3: NaN, rc5: 830, rc10: 800, rc20: NaN },
  ];

  it('produces a header row', () => {
    const csv = rowsToCsv(rows);
    expect(csv.split('\n')[0]).toBe('"Race","Country","Series","RCI3","RCI5","RCI10","RCI20"');
  });

  it('formats finite RCI values to 2 decimal places', () => {
    const csv = rowsToCsv(rows);
    const line1 = csv.split('\n')[1];
    expect(line1).toContain('"870.50"');
    expect(line1).toContain('"850.20"');
  });

  it('outputs empty string for NaN values', () => {
    const csv = rowsToCsv(rows);
    const line2 = csv.split('\n')[2];
    expect(line2).toContain('""'); // rc3 and rc20 are NaN
    expect(line2).toContain('"830.00"');
  });

  it('returns only header for empty rows array', () => {
    const csv = rowsToCsv([]);
    const lines = csv.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
  });

  it('handles special characters in race name', () => {
    const csv = rowsToCsv([{ name: 'Race "A"', country: '', series: '', rc3: 1, rc5: 1, rc10: 1, rc20: 1 }]);
    expect(csv).toContain('"Race ""A"""');
  });
});
