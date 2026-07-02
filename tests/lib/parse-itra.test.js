// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseItraHtml } from '../../lib/parse-itra.js';

function makeTable(rows) {
  return `<table id="RunnerRaceResults"><tbody>${rows}</tbody></table>`;
}

function makeRow(rank, name, score, gender, nationality) {
  return `<tr>
    <td>${rank}</td>
    <td><a href="#">${name}</a></td>
    <td>01:30:00</td>
    <td>${score}</td>
    <td>extra</td>
    <td>${gender}</td>
    <td>${nationality}</td>
  </tr>`;
}

describe('parseItraHtml', () => {
  it('parses a valid results table', () => {
    const html = makeTable(
      makeRow(1, 'ELAZZAOUI Elhousine', 936, 'M', 'MAR') +
      makeRow(2, 'JORNET Kilian', 920, 'M', 'ESP')
    );
    const results = parseItraHtml(html, 'https://itra.run/Races/RaceResults/Zegama/2025/1');
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ rank: 1, runner: 'ELAZZAOUI Elhousine', index: 936, gender: 'M', nationality: 'MAR' });
    expect(results[1]).toMatchObject({ rank: 2, runner: 'JORNET Kilian', index: 920, gender: 'M', nationality: 'ESP' });
  });

  it('normalizes gender H → M (French)', () => {
    const html = makeTable(makeRow(1, 'Dupont Jean', 800, 'H', 'FRA'));
    const results = parseItraHtml(html, '');
    expect(results[0].gender).toBe('M');
  });

  it('normalizes gender F correctly', () => {
    const html = makeTable(makeRow(1, 'Dupont Marie', 750, 'F', 'FRA'));
    const results = parseItraHtml(html, '');
    expect(results[0].gender).toBe('F');
  });

  it('skips rows with score ≤ 0 or non-numeric score', () => {
    const html = makeTable(
      makeRow(1, 'Alice', 0, 'F', 'FRA') +
      makeRow(2, 'Bob', '-', 'M', 'ESP') +
      makeRow(3, 'Charlie', 800, 'M', 'ITA')
    );
    const results = parseItraHtml(html, '');
    expect(results).toHaveLength(1);
    expect(results[0].rank).toBe(3);
  });

  it('skips rows with fewer than 7 cells', () => {
    const shortRow = '<tr><td>1</td><td>Alice</td><td>900</td></tr>';
    const validRow = makeRow(2, 'Bob', 850, 'M', 'ESP');
    const html = makeTable(shortRow + validRow);
    const results = parseItraHtml(html, '');
    expect(results).toHaveLength(1);
    expect(results[0].rank).toBe(2);
  });

  it('throws when results table is not found (no login hint)', () => {
    expect(() => parseItraHtml('<html><body>Not found</body></html>', '')).toThrow('Results table not found');
  });

  it('throws session error when login form is present', () => {
    const loginHtml = '<html><body><form action="/login"><input type="password" /></form></body></html>';
    expect(() => parseItraHtml(loginHtml, '')).toThrow('SessionToken expired');
  });

  it('throws when table exists but all rows have no score', () => {
    const html = makeTable(makeRow(1, 'Alice', '-', 'F', 'FRA'));
    expect(() => parseItraHtml(html, '')).toThrow('No valid results found');
  });
});
