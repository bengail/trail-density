import { describe, it, expect } from 'vitest';
import {
  parseSeriesInput, parseNullableNumber, asNullableText,
  normalizeHeaderKey, detectDelimiter, looksLikeHeader,
  parsePastedResults, itraUrlToMeta, makeBulkRaceId,
  parseCsvLine, parseBulkCsv, toNumberLoose, readField,
  parseDelimitedRow, findLikelyScoreCell
} from '../../lib/parse.js';

describe('parseSeriesInput', () => {
  it('returns single string for single value', () => {
    expect(parseSeriesInput('GTWS')).toBe('GTWS');
  });

  it('returns array for comma-separated values', () => {
    expect(parseSeriesInput('GTWS, UTMB')).toEqual(['GTWS', 'UTMB']);
  });

  it('returns null for empty/blank input', () => {
    expect(parseSeriesInput('')).toBeNull();
    expect(parseSeriesInput('  ')).toBeNull();
    expect(parseSeriesInput(null)).toBeNull();
  });
});

describe('parseNullableNumber', () => {
  it('parses valid numbers', () => {
    expect(parseNullableNumber('42')).toBe(42);
    expect(parseNullableNumber('3.14')).toBe(3.14);
  });

  it('returns null for blank input', () => {
    expect(parseNullableNumber('')).toBeNull();
    expect(parseNullableNumber(null)).toBeNull();
  });

  it('returns null for non-numeric strings', () => {
    expect(parseNullableNumber('abc')).toBeNull();
  });
});

describe('asNullableText', () => {
  it('returns trimmed text for non-empty string', () => {
    expect(asNullableText('  hello  ')).toBe('hello');
  });

  it('returns null for blank or null input', () => {
    expect(asNullableText('')).toBeNull();
    expect(asNullableText('   ')).toBeNull();
    expect(asNullableText(null)).toBeNull();
    expect(asNullableText(undefined)).toBeNull();
  });
});

describe('normalizeHeaderKey', () => {
  it('lowercases and replaces non-alphanumeric with underscore', () => {
    expect(normalizeHeaderKey('Race Score')).toBe('race_score');
    expect(normalizeHeaderKey('ITRA Score')).toBe('itra_score');
  });

  it('strips leading/trailing underscores', () => {
    expect(normalizeHeaderKey(' _hello_ ')).toBe('hello');
  });
});

describe('detectDelimiter', () => {
  it('detects tab delimiter', () => {
    expect(detectDelimiter('1\tAlice\t900')).toBe('\t');
  });

  it('detects semicolon delimiter', () => {
    expect(detectDelimiter('1;Alice;900')).toBe(';');
  });

  it('defaults to comma', () => {
    expect(detectDelimiter('1,Alice,900')).toBe(',');
  });

  it('prefers tab over comma and semicolon', () => {
    expect(detectDelimiter('1\tAlice\t900,extra')).toBe('\t');
  });
});

describe('looksLikeHeader', () => {
  it('returns true when known column names present', () => {
    expect(looksLikeHeader(['Rank', 'Runner', 'Score', 'Gender'])).toBe(true);
    expect(looksLikeHeader(['Position', 'Name', 'ITRA Score'])).toBe(true);
  });

  it('returns false for all-numeric rows', () => {
    expect(looksLikeHeader(['1', 'Alice Smith', '900', 'F', 'FRA'])).toBe(false);
  });
});

describe('toNumberLoose', () => {
  it('parses comma-decimal notation', () => {
    expect(toNumberLoose('3,14')).toBe(3.14);
  });

  it('returns NaN for empty string', () => {
    expect(toNumberLoose('')).toBeNaN();
  });

  it('returns NaN for non-numeric', () => {
    expect(toNumberLoose('abc')).toBeNaN();
  });
});

describe('parseDelimitedRow', () => {
  it('splits on delimiter and trims cells', () => {
    expect(parseDelimitedRow(' a , b , c ', ',')).toEqual(['a', 'b', 'c']);
  });
});

describe('readField', () => {
  it('finds field by header alias', () => {
    const headers = ['rank', 'runner', 'score'];
    const row = ['1', 'Alice', '900'];
    expect(readField(row, headers, ['score', 'index'])).toBe('900');
  });

  it('returns empty string when alias not found', () => {
    expect(readField(['1', 'Alice'], [], ['rank'])).toBe('');
  });
});

describe('findLikelyScoreCell', () => {
  it('returns last numeric cell that looks like a score', () => {
    expect(findLikelyScoreCell(['1', 'Alice Smith', '1:30:00', '850'])).toBe('850');
  });

  it('skips cells containing colons (times)', () => {
    expect(findLikelyScoreCell(['1', 'Alice', '1:30:00'])).toBe('');
  });
});

describe('parsePastedResults', () => {
  it('parses tab-delimited results with headers', () => {
    const text = 'Rank\tRunner\tTime\tScore\tExtra\tGender\tNationality\n1\tAlice\t1:30\t850\t-\tF\tFRA\n2\tBob\t1:35\t820\t-\tM\tESP';
    const results = parsePastedResults(text);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ rank: 1, runner: 'Alice', index: 850, gender: 'F', nationality: 'FRA' });
  });

  it('parses comma-delimited results without headers', () => {
    const text = '1,Alice,1:30,850,,F,FRA\n2,Bob,1:35,820,,M,ESP';
    const results = parsePastedResults(text);
    expect(results).toHaveLength(2);
    expect(results[0].rank).toBe(1);
    expect(results[0].index).toBe(850);
  });

  it('skips rows with invalid rank or index', () => {
    const text = 'Rank\tScore\nABC\t850\n1\tbad\n2\t800';
    const results = parsePastedResults(text);
    expect(results).toHaveLength(1);
    expect(results[0].rank).toBe(2);
  });

  it('throws on empty input', () => {
    expect(() => parsePastedResults('')).toThrow('empty');
  });

  it('throws when no valid rows found', () => {
    expect(() => parsePastedResults('Rank\tScore\nfoo\tbar')).toThrow('No valid rows');
  });

  it('sorts results by rank', () => {
    const text = '3,C,0,700,,M,\n1,A,0,900,,M,\n2,B,0,800,,M,';
    const results = parsePastedResults(text);
    expect(results.map(r => r.rank)).toEqual([1, 2, 3]);
  });
});

describe('itraUrlToMeta', () => {
  it('extracts name, year, raceId from ITRA URL', () => {
    const url = 'https://itra.run/Races/RaceResults/Black.Canyon.Ultras.100K/2026/12345';
    const meta = itraUrlToMeta(url);
    expect(meta.name).toBe('Black Canyon Ultras 100K');
    expect(meta.year).toBe(2026);
    expect(meta.raceId).toBe('BLACK_CANYON_ULTRAS_100K_2026');
  });

  it('returns empty object for non-matching URL', () => {
    expect(itraUrlToMeta('https://example.com')).toEqual({});
  });
});

describe('makeBulkRaceId', () => {
  it('combines name, km and year into uppercase slug', () => {
    expect(makeBulkRaceId('UTMB', 171, 2025)).toBe('UTMB_171KM_2025');
  });

  it('omits km when null', () => {
    expect(makeBulkRaceId('Zegama', null, 2025)).toBe('ZEGAMA_2025');
  });

  it('replaces special characters with underscores', () => {
    expect(makeBulkRaceId('Broken Arrow 52K', 52, 2025)).toBe('BROKEN_ARROW_52K_52KM_2025');
  });
});

describe('parseCsvLine', () => {
  it('splits on commas', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields with embedded commas', () => {
    expect(parseCsvLine('"Broken, Arrow",52,1200')).toEqual(['Broken, Arrow', '52', '1200']);
  });

  it('also splits on semicolons', () => {
    expect(parseCsvLine('a;b;c')).toEqual(['a', 'b', 'c']);
  });
});

describe('parseBulkCsv', () => {
  const csvText = [
    'FR,UTMB,171,10000,850,https://itra.run/Races/RaceResults/UTMB/2025/1234',
    'ES,Zegama,42,4500,900,https://itra.run/Races/RaceResults/Zegama/2025/5678',
  ].join('\n');

  it('parses valid rows', () => {
    const rows = parseBulkCsv(csvText);
    expect(rows).toHaveLength(2);
    expect(rows[0].country).toBe('FR');
    expect(rows[0].name).toBe('UTMB');
    expect(rows[0].km).toBe(171);
    expect(rows[0].status).toBe('pending');
  });

  it('skips rows with fewer than 6 columns', () => {
    const rows = parseBulkCsv('FR,UTMB,171,10000');
    expect(rows).toHaveLength(0);
  });

  it('skips rows where last column is not a URL', () => {
    const rows = parseBulkCsv('header,row,that,should,be,skipped');
    expect(rows).toHaveLength(0);
  });

  it('derives year from ITRA URL', () => {
    const rows = parseBulkCsv(csvText);
    expect(rows[0].computedRaceId).toContain('2025');
  });
});
