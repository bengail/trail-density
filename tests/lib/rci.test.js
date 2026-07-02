import { describe, it, expect } from 'vitest';
import { normalizeItraFemaleIndex, topScoresFrom, rciFromResults, getTopStats } from '../../lib/rci.js';

const mkR = (rank, index, gender = 'M') => ({ rank, index, gender });

describe('normalizeItraFemaleIndex', () => {
  it('applies the quadratic adjustment', () => {
    const score = 800;
    const expected = ((-0.000466 * 800) + 1.532) * 800;
    expect(normalizeItraFemaleIndex(score)).toBeCloseTo(expected, 8);
  });

  it('result is higher than input for typical elite scores (600–950)', () => {
    expect(normalizeItraFemaleIndex(700)).toBeGreaterThan(700);
    expect(normalizeItraFemaleIndex(900)).toBeGreaterThan(900);
  });

  it('returns NaN for non-finite input', () => {
    expect(normalizeItraFemaleIndex(NaN)).toBeNaN();
    expect(normalizeItraFemaleIndex(Infinity)).toBeNaN();
  });

  it('returns 0 for score=0', () => {
    expect(normalizeItraFemaleIndex(0)).toBe(0);
  });
});

describe('topScoresFrom', () => {
  const results = [
    mkR(1, 900), mkR(2, 850), mkR(3, 800), mkR(4, 750), mkR(5, 700)
  ];

  it('returns top n scores in rank order', () => {
    expect(topScoresFrom(results, 3)).toEqual([900, 850, 800]);
  });

  it('respects limitByRank=true (default) — excludes rank > n', () => {
    const mixed = [mkR(1, 900), mkR(3, 800), mkR(5, 700)];
    expect(topScoresFrom(mixed, 3)).toEqual([900, 800]);
  });

  it('respects limitByRank=false — takes first n by rank regardless', () => {
    const mixed = [mkR(1, 900), mkR(3, 800), mkR(5, 700)];
    expect(topScoresFrom(mixed, 3, false)).toEqual([900, 800, 700]);
  });

  it('filters out invalid results (non-finite rank or index)', () => {
    const dirty = [mkR(1, 900), mkR(NaN, 850), mkR(2, NaN), mkR(3, 800)];
    expect(topScoresFrom(dirty, 5, false)).toEqual([900, 800]);
  });

  it('returns empty array for empty input', () => {
    expect(topScoresFrom([], 5)).toEqual([]);
  });

  it('filters out rank < 1', () => {
    expect(topScoresFrom([mkR(0, 900), mkR(-1, 800), mkR(1, 700)], 5, false)).toEqual([700]);
  });
});

describe('rciFromResults', () => {
  it('returns mean minus population std', () => {
    const results = [mkR(1, 900), mkR(2, 800), mkR(3, 700)];
    const values = [900, 800, 700];
    const m = (900 + 800 + 700) / 3;
    const std = Math.sqrt(((900 - m) ** 2 + (800 - m) ** 2 + (700 - m) ** 2) / 3);
    expect(rciFromResults(results, 3, false)).toBeCloseTo(m - std, 6);
  });

  it('returns NaN for empty or all-invalid results', () => {
    expect(rciFromResults([], 10)).toBeNaN();
    expect(rciFromResults([mkR(NaN, 900)], 10)).toBeNaN();
  });

  it('returns exact mean when only one result (std=0)', () => {
    expect(rciFromResults([mkR(1, 850)], 1, false)).toBe(850);
  });
});

describe('getTopStats', () => {
  it('returns mean, std, and rci for top n', () => {
    const results = [mkR(1, 900), mkR(2, 800), mkR(3, 700)];
    const stats = getTopStats(results, 3);
    expect(stats.mean).toBeCloseTo(800, 6);
    expect(stats.rci).toBeCloseTo(800 - stats.std, 6);
  });

  it('returns NaN fields for empty input', () => {
    const stats = getTopStats([], 5);
    expect(stats.mean).toBeNaN();
    expect(stats.std).toBeNaN();
    expect(stats.rci).toBeNaN();
  });
});
