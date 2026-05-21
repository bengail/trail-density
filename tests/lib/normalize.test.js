import { describe, it, expect } from 'vitest';
import {
  normalizeSeries, normalizeGenderLabel, inferRaceGender,
  filterResultsByGender, normalizeCourse, getRciResultsForMode, normalizeCountry
} from '../../lib/normalize.js';

describe('normalizeSeries', () => {
  it('wraps a string in an array', () => {
    expect(normalizeSeries("GTWS")).toEqual(["GTWS"]);
  });

  it('passes through an array, filtering empties', () => {
    expect(normalizeSeries(["GTWS", "", "UTMB"])).toEqual(["GTWS", "UTMB"]);
  });

  it('returns empty array for null/undefined/empty string', () => {
    expect(normalizeSeries(null)).toEqual([]);
    expect(normalizeSeries(undefined)).toEqual([]);
    expect(normalizeSeries("")).toEqual([]);
    expect(normalizeSeries("   ")).toEqual([]);
  });

  it('trims whitespace from string input', () => {
    expect(normalizeSeries("  GTWS  ")).toEqual(["GTWS"]);
  });
});

describe('normalizeGenderLabel', () => {
  it('maps male variants to "male"', () => {
    for (const v of ["m", "M", "men", "MEN", "man", "male", "MALE", "homme", "HOMME", "h", "H"]) {
      expect(normalizeGenderLabel(v)).toBe("male");
    }
  });

  it('maps female variants to "female"', () => {
    for (const v of ["f", "F", "women", "WOMEN", "woman", "female", "FEMALE", "femme", "FEMME", "w", "W"]) {
      expect(normalizeGenderLabel(v)).toBe("female");
    }
  });

  it('returns null for unknown or empty values', () => {
    expect(normalizeGenderLabel(null)).toBeNull();
    expect(normalizeGenderLabel("")).toBeNull();
    expect(normalizeGenderLabel("unknown")).toBeNull();
    expect(normalizeGenderLabel("X")).toBeNull();
  });
});

describe('inferRaceGender', () => {
  it('infers male from "(Men)" in name', () => {
    expect(inferRaceGender({ name: "Zegama (Men)", race_id: "" })).toBe("male");
  });

  it('infers female from "(Women)" in name', () => {
    expect(inferRaceGender({ name: "Zegama (Women)", race_id: "" })).toBe("female");
  });

  it('infers from French labels', () => {
    expect(inferRaceGender({ name: "Course Homme", race_id: "" })).toBe("male");
    expect(inferRaceGender({ name: "Course Femme", race_id: "" })).toBe("female");
  });

  it('returns null for ungendered race names', () => {
    expect(inferRaceGender({ name: "UTMB 2025", race_id: "UTMB2025" })).toBeNull();
  });

  it('handles missing meta gracefully', () => {
    expect(inferRaceGender({})).toBeNull();
    expect(inferRaceGender(null)).toBeNull();
  });
});

describe('filterResultsByGender', () => {
  const results = [
    { rank: 1, index: 900, gender: 'M' },
    { rank: 2, index: 850, gender: 'F' },
    { rank: 3, index: 800, gender: 'male' },
    { rank: 4, index: 750, gender: null },
  ];

  it('filters to male results', () => {
    const r = filterResultsByGender(results, 'male');
    expect(r.map(x => x.rank)).toEqual([1, 3]);
  });

  it('filters to female results', () => {
    const r = filterResultsByGender(results, 'female');
    expect(r.map(x => x.rank)).toEqual([2]);
  });

  it('returns all results when gender is null', () => {
    expect(filterResultsByGender(results, null)).toHaveLength(4);
  });

  it('handles null/undefined input', () => {
    expect(filterResultsByGender(null, 'male')).toEqual([]);
    expect(filterResultsByGender(undefined, 'male')).toEqual([]);
  });
});

describe('normalizeCourse', () => {
  it('normalizes results: coerces rank/index to numbers, filters invalid', () => {
    const raw = {
      meta: { race_id: 'TEST2025', series: 'GTWS' },
      results: [
        { rank: '1', index: '900', runner: 'Alice', gender: 'F', nationality: 'FRA' },
        { rank: 'x', index: '850', runner: 'Bob', gender: 'M', nationality: null },
        { rank: '2', index: 'bad', runner: 'Charlie', gender: 'M', nationality: 'ESP' },
        { rank: '3', index: '800', runner: null, gender: null, nationality: null },
      ]
    };
    const c = normalizeCourse(raw, 'TEST2025');
    expect(c.results).toHaveLength(2);
    expect(c.results[0]).toMatchObject({ rank: 1, index: 900, runner: 'Alice' });
    expect(c.results[1]).toMatchObject({ rank: 3, index: 800, runner: null });
  });

  it('normalizes series to array', () => {
    const c = normalizeCourse({ meta: { series: 'GTWS' }, results: [] }, 'X');
    expect(c.meta.series).toEqual(['GTWS']);
  });

  it('uses fallbackRaceId when meta.race_id is missing', () => {
    const c = normalizeCourse({ meta: {}, results: [] }, 'FALLBACK');
    expect(c.meta.race_id).toBe('FALLBACK');
  });

  it('derives race_slug from race_id by stripping _YEAR suffix', () => {
    const c = normalizeCourse({ meta: { race_id: 'CCC_2025' }, results: [] }, 'CCC_2025');
    expect(c.meta.race_slug).toBe('CCC');
  });

  it('uses meta.race_slug when already provided', () => {
    const c = normalizeCourse({ meta: { race_id: 'WS_2025', race_slug: 'WS' }, results: [] }, 'WS_2025');
    expect(c.meta.race_slug).toBe('WS');
  });

  it('sets itra_id to null when not provided', () => {
    const c = normalizeCourse({ meta: { race_id: 'X_2025' }, results: [] }, 'X_2025');
    expect(c.meta.itra_id).toBeNull();
  });

  it('preserves itra_id from meta', () => {
    const c = normalizeCourse({ meta: { race_id: 'X_2025', itra_id: 99999 }, results: [] }, 'X_2025');
    expect(c.meta.itra_id).toBe(99999);
  });

  it('sorts results by rank ascending', () => {
    const raw = {
      meta: { race_id: 'T' },
      results: [{ rank: 3, index: 700 }, { rank: 1, index: 900 }, { rank: 2, index: 800 }]
    };
    const c = normalizeCourse(raw, 'T');
    expect(c.results.map(r => r.rank)).toEqual([1, 2, 3]);
  });
});

describe('getRciResultsForMode', () => {
  const results = [
    { rank: 1, index: 700, gender: 'F' },
    { rank: 2, index: 650, gender: 'F' },
    { rank: 3, index: 900, gender: 'M' },
  ];

  it('filters by gender', () => {
    const r = getRciResultsForMode(results, 'female', false);
    expect(r).toHaveLength(2);
  });

  it('normalizes female indexes when normalizeFemale=true', () => {
    const r = getRciResultsForMode(results, 'female', true);
    expect(r[0].index).toBeGreaterThan(700);
  });

  it('does not normalize male indexes', () => {
    const r = getRciResultsForMode(results, 'male', true);
    expect(r[0].index).toBe(900);
  });
});

describe('normalizeCountry', () => {
  it('maps Italia to Italy', () => expect(normalizeCountry('Italia')).toBe('Italy'));
  it('maps ITA to Italy (case-insensitive)', () => expect(normalizeCountry('ITA')).toBe('Italy'));
  it('maps Suisse to Switzerland', () => expect(normalizeCountry('Suisse')).toBe('Switzerland'));
  it('maps schweiz to Switzerland', () => expect(normalizeCountry('Schweiz')).toBe('Switzerland'));
  it('passes through known-good values unchanged', () => {
    expect(normalizeCountry('France')).toBe('France');
    expect(normalizeCountry('Canada')).toBe('Canada');
    expect(normalizeCountry('Spain')).toBe('Spain');
  });
  it('returns null for null', () => expect(normalizeCountry(null)).toBeNull());
  it('trims whitespace', () => expect(normalizeCountry('  Italia  ')).toBe('Italy'));
});
