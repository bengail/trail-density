import { describe, it, expect } from 'vitest';
import { mean, stdPop, fmt } from '../../lib/math.js';

describe('mean', () => {
  it('returns the arithmetic mean', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([10, 20])).toBe(15);
  });

  it('handles a single value', () => {
    expect(mean([42])).toBe(42);
  });

  it('returns NaN for empty array', () => {
    expect(mean([])).toBeNaN();
  });

  it('handles floating point inputs', () => {
    expect(mean([0.1, 0.2, 0.3])).toBeCloseTo(0.2, 10);
  });
});

describe('stdPop', () => {
  it('returns 0 for all-equal values', () => {
    expect(stdPop([5, 5, 5])).toBe(0);
  });

  it('computes population std correctly', () => {
    // mean=2, deviations: 1,0,1 → variance=2/3 → std≈0.8165
    expect(stdPop([1, 2, 3])).toBeCloseTo(Math.sqrt(2 / 3), 8);
  });

  it('returns NaN for empty array', () => {
    expect(stdPop([])).toBeNaN();
  });

  it('handles a single value (std=0)', () => {
    expect(stdPop([7])).toBe(0);
  });

  it('known case: [900, 800, 700] → std=81.65', () => {
    expect(stdPop([900, 800, 700])).toBeCloseTo(81.65, 1);
  });
});

describe('fmt', () => {
  it('formats to 1 decimal by default', () => {
    expect(fmt(123.456)).toBe('123.5');
  });

  it('formats to specified decimal places', () => {
    expect(fmt(123.456, 2)).toBe('123.46');
    expect(fmt(123.456, 0)).toBe('123');
  });

  it('returns "-" for non-finite values', () => {
    expect(fmt(NaN)).toBe('-');
    expect(fmt(Infinity)).toBe('-');
    expect(fmt(-Infinity)).toBe('-');
  });
});
