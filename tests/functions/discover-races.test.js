import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost, parseRaceCards, parseKm, parseElev } from '../../functions/api/discover-races.js';

function makeContext(body) {
  return { request: { json: () => Promise.resolve(body) } };
}

function makeContextBadJson() {
  return { request: { json: () => Promise.reject(new SyntaxError('bad json')) } };
}

describe('discover-races onRequestPost validation', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns 400 for invalid JSON body', async () => {
    const res = await onRequestPost(makeContextBadJson());
    expect(res.status).toBe(400);
  });

  it('returns 400 when countries is missing', async () => {
    const res = await onRequestPost(makeContext({ dateStart: '01-01-2025', dateEnd: '12-31-2025' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when countries is empty array', async () => {
    const res = await onRequestPost(makeContext({ countries: [], dateStart: '01-01-2025', dateEnd: '12-31-2025' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when dateStart is missing', async () => {
    const res = await onRequestPost(makeContext({ countries: ['FR'], dateEnd: '12-31-2025' }));
    expect(res.status).toBe(400);
  });

  it('returns 502 on network error during GET', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await onRequestPost(makeContext({ countries: ['FR'], dateStart: '01-01-2025', dateEnd: '12-31-2025' }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/GET itra.run failed/i);
  });

  it('returns 502 when CSRF token not found in GET response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><body>no token here</body></html>'),
      headers: { getAll: () => [], get: () => null }
    }));
    const res = await onRequestPost(makeContext({ countries: ['FR'], dateStart: '01-01-2025', dateEnd: '12-31-2025' }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/CSRF token not found/i);
  });
});

describe('parseKm', () => {
  it('parses simple km string', () => {
    expect(parseKm('42 km')).toBe(42);
    expect(parseKm('171.5')).toBe(171.5);
  });

  it('returns null for empty or non-numeric', () => {
    expect(parseKm('')).toBeNull();
    expect(parseKm('unknown')).toBeNull();
  });
});

describe('parseElev', () => {
  it('parses elevation with spaces and plus sign', () => {
    expect(parseElev('+1 800 m')).toBe(1800);
    expect(parseElev('+426 m')).toBe(426);
  });

  it('strips all non-digit characters', () => {
    expect(parseElev('10,000 m')).toBe(10000);
  });

  it('returns null for empty string', () => {
    expect(parseElev('')).toBeNull();
  });
});

describe('parseRaceCards', () => {
  it('returns empty array when JSON marker not found', () => {
    expect(parseRaceCards('<html><body>no data</body></html>')).toEqual([]);
  });

  it('parses race name, country and distance from HTML', () => {
    const html = `
      var raceSearchJsonSidePopupNew = [
        <h4>UTMB Mont-Blanc</h4>
        <img src="/images/CountryFlags/fr.svg" />
        <div class='boxes'>
          <a href='/Races/RaceDetails/UTMB/2025/1'>details</a>
          <span class='count'>171 km</span>
          <span class='distance'>+10000 m</span>
          <img src="/images/green.svg" />
        </div>
      ];
    `;
    const races = parseRaceCards(html);
    expect(races).toHaveLength(1);
    expect(races[0].name).toBe('UTMB Mont-Blanc');
    expect(races[0].country).toBe('FR');
    expect(races[0].km).toBe(171);
    expect(races[0].elevation).toBe(10000);
    expect(races[0].url).toContain('/RaceResults/');
  });

  it('excludes boxes without results (no green.svg)', () => {
    const html = `
      var raceSearchJsonSidePopupNew = [
        <h4>Some Race</h4>
        <img src="/images/CountryFlags/it.svg" />
        <div class='boxes'>
          <a href='/Races/RaceDetails/SomeRace/2025/1'>details</a>
          <span class='count'>50 km</span>
          <span class='distance'>+2000 m</span>
        </div>
      ];
    `;
    const races = parseRaceCards(html);
    expect(races).toHaveLength(0);
  });

  it('handles multiple races in one page', () => {
    const html = `
      var raceSearchJsonSidePopupNew = [
        <h4>Race One</h4>
        <img src="/images/CountryFlags/fr.svg" />
        <div class='boxes'>
          <a href='/Races/RaceDetails/R1/2025/1'>details</a>
          <span class='count'>42 km</span>
          <span class='distance'>+2000 m</span>
          <img src="/images/green.svg" />
        </div>
        <h4>Race Two</h4>
        <img src="/images/CountryFlags/es.svg" />
        <div class='boxes'>
          <a href='/Races/RaceDetails/R2/2025/2'>details</a>
          <span class='count'>80 km</span>
          <span class='distance'>+4500 m</span>
          <img src="/images/green.svg" />
        </div>
      ];
    `;
    const races = parseRaceCards(html);
    expect(races).toHaveLength(2);
    expect(races[0].name).toBe('Race One');
    expect(races[1].name).toBe('Race Two');
    expect(races[1].country).toBe('ES');
  });
});
