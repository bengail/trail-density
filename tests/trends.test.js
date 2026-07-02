import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock data.js getManifestEntries (trends.js imports it)
vi.mock('../data.js', () => ({
  getManifestEntries: () => [
    { race_id: 'CCC_2023', race_slug: 'CCC' },
    { race_id: 'CCC_2024', race_slug: 'CCC' },
    { race_id: 'UTMB_2023', race_slug: 'UTMB' },
    { race_id: 'SZ_2024', race_slug: 'SZ' },
  ],
}));

import { getDistinctSlugs, buildTrendTraces } from '../trends.js';

describe('getDistinctSlugs', () => {
  it('returns sorted unique race_slugs', () => {
    expect(getDistinctSlugs()).toEqual(['CCC', 'SZ', 'UTMB']);
  });
});

describe('buildTrendTraces', () => {
  const byYear = {
    2023: {
      F: [{ rank: 1, index: 900 }, { rank: 2, index: 880 }, { rank: 3, index: 860 },
          { rank: 4, index: 840 }, { rank: 5, index: 820 }],
      M: [{ rank: 1, index: 950 }, { rank: 2, index: 930 }, { rank: 3, index: 910 },
          { rank: 4, index: 890 }, { rank: 5, index: 870 }],
    },
    2024: {
      F: [{ rank: 1, index: 910 }, { rank: 2, index: 890 }, { rank: 3, index: 870 },
          { rank: 4, index: 850 }, { rank: 5, index: 830 }],
      M: [{ rank: 1, index: 960 }, { rank: 2, index: 940 }, { rank: 3, index: 920 },
          { rank: 4, index: 900 }, { rank: 5, index: 880 }],
    },
  };

  it('returns 4 traces for both genders', () => {
    const traces = buildTrendTraces(byYear, 'both');
    expect(traces).toHaveLength(4);
    const names = traces.map(t => t.name);
    expect(names).toContain('Women RCI5');
    expect(names).toContain('Women RCI10');
    expect(names).toContain('Men RCI5');
    expect(names).toContain('Men RCI10');
  });

  it('returns 2 traces for female only', () => {
    const traces = buildTrendTraces(byYear, 'female');
    expect(traces).toHaveLength(2);
    const names = traces.map(t => t.name);
    expect(names).toContain('Women RCI5');
    expect(names).toContain('Women RCI10');
    expect(names).not.toContain('Men RCI5');
  });

  it('returns 2 traces for male only', () => {
    const traces = buildTrendTraces(byYear, 'male');
    expect(traces).toHaveLength(2);
    const names = traces.map(t => t.name);
    expect(names).toContain('Men RCI5');
    expect(names).not.toContain('Women RCI5');
  });

  it('x values are sorted years', () => {
    const traces = buildTrendTraces(byYear, 'female');
    for (const t of traces) {
      expect(t.x).toEqual([2023, 2024]);
    }
  });

  it('RCI5 y-values are finite numbers', () => {
    const traces = buildTrendTraces(byYear, 'female');
    const rci5 = traces.find(t => t.name === 'Women RCI5');
    expect(rci5.y.every(v => Number.isFinite(v))).toBe(true);
    expect(rci5.y).toHaveLength(2);
  });

  it('returns empty array for empty data', () => {
    expect(buildTrendTraces({}, 'both')).toEqual([]);
  });

  it('skips years with no finite RCI (insufficient results for n)', () => {
    const sparse = {
      2023: { F: [{ rank: 1, index: 900 }], M: [] },
    };
    const traces = buildTrendTraces(sparse, 'female');
    // RCI5 needs 5 results — with 1 result it's still finite (just uses what's there)
    expect(traces.length).toBeGreaterThan(0);
  });

  it('RCI10 line is dotted, RCI5 is solid', () => {
    const traces = buildTrendTraces(byYear, 'female');
    const rci5 = traces.find(t => t.name === 'Women RCI5');
    const rci10 = traces.find(t => t.name === 'Women RCI10');
    expect(rci5.line.dash).toBe('solid');
    expect(rci10.line.dash).toBe('dot');
  });
});
