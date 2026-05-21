import { describe, it, expect } from 'vitest';
import { matchesFilters, fuzzyMatch, densityColor } from '../../lib/filters.js';

describe('matchesFilters', () => {
  const meta = { country: 'Spain', series: ['GTWS', 'UTMB'] };

  it('matches when no filters applied', () => {
    expect(matchesFilters(meta, { country: '', series: [] })).toBe(true);
  });

  it('matches by country', () => {
    expect(matchesFilters(meta, { country: 'Spain', series: [] })).toBe(true);
    expect(matchesFilters(meta, { country: 'France', series: [] })).toBe(false);
  });

  it('matches by series (any match)', () => {
    expect(matchesFilters(meta, { country: '', series: ['GTWS'] })).toBe(true);
    expect(matchesFilters(meta, { country: '', series: ['IMTBF'] })).toBe(false);
  });

  it('handles string series filter', () => {
    expect(matchesFilters(meta, { country: '', series: 'GTWS' })).toBe(true);
  });

  it('combines country and series (both must match)', () => {
    expect(matchesFilters(meta, { country: 'Spain', series: ['GTWS'] })).toBe(true);
    expect(matchesFilters(meta, { country: 'France', series: ['GTWS'] })).toBe(false);
  });

  it('handles null meta gracefully', () => {
    expect(matchesFilters(null, { country: '', series: [] })).toBe(true);
    expect(matchesFilters(null, { country: 'Spain', series: [] })).toBe(false);
  });
});

describe('fuzzyMatch', () => {
  it('matches when all terms are present', () => {
    expect(fuzzyMatch('utmb 2025', 'UTMB 2025 results')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('UTMB', 'utmb 2025')).toBe(true);
  });

  it('returns false when any term is missing', () => {
    expect(fuzzyMatch('utmb zegama', 'utmb 2025')).toBe(false);
  });

  it('matches substring of a word', () => {
    expect(fuzzyMatch('zeg', 'Zegama 2025')).toBe(true);
    expect(fuzzyMatch('gama', 'Zegama 2025')).toBe(true);
  });
});

describe('densityColor', () => {
  it('returns empty string for non-finite value', () => {
    expect(densityColor(NaN, 0, 100)).toBe('');
    expect(densityColor(Infinity, 0, 100)).toBe('');
  });

  it('returns flat style when min === max', () => {
    const style = densityColor(50, 50, 50);
    expect(style).toContain('hsl(224,70%,92%)');
  });

  it('lowest value gets lightest background', () => {
    const low = densityColor(0, 0, 100);
    const high = densityColor(100, 0, 100);
    const lowLightness = parseFloat(low.match(/hsl\(224, \d+%, (\d+)%\)/)?.[1]);
    const highLightness = parseFloat(high.match(/hsl\(224, \d+%, (\d+)%\)/)?.[1]);
    expect(lowLightness).toBeGreaterThan(highLightness);
  });

  it('highest value gets dark text (white)', () => {
    const high = densityColor(100, 0, 100);
    expect(high).toContain('#ffffff');
  });

  it('lowest value gets dark text (#0f172a)', () => {
    const low = densityColor(0, 0, 100);
    expect(low).toContain('#0f172a');
  });

  it('clamps values outside range', () => {
    const normal = densityColor(100, 0, 100);
    const over = densityColor(200, 0, 100);
    expect(normal).toBe(over);
  });
});
