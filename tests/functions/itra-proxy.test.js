import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost } from '../../functions/api/itra-proxy.js';

function makeContext(body) {
  return {
    request: {
      json: () => Promise.resolve(body)
    }
  };
}

function makeContextBadJson() {
  return {
    request: {
      json: () => Promise.reject(new SyntaxError('bad json'))
    }
  };
}

describe('itra-proxy onRequestPost', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await onRequestPost(makeContextBadJson());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid JSON/i);
  });

  it('returns 400 when url is missing', async () => {
    const res = await onRequestPost(makeContext({ cookieHeader: 'session=abc' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid URL/i);
  });

  it('returns 400 when url does not start with itra.run/Races/RaceResults/', async () => {
    const res = await onRequestPost(makeContext({
      url: 'https://evil.com/hack',
      cookieHeader: 'session=abc'
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when cookieHeader is missing', async () => {
    const res = await onRequestPost(makeContext({
      url: 'https://itra.run/Races/RaceResults/UTMB/2025/1'
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cookieHeader/i);
  });

  it('returns 502 on network error fetching itra.run', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await onRequestPost(makeContext({
      url: 'https://itra.run/Races/RaceResults/UTMB/2025/1',
      cookieHeader: 'session=abc'
    }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Network error/i);
  });

  it('returns 502 when itra.run returns non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const res = await onRequestPost(makeContext({
      url: 'https://itra.run/Races/RaceResults/UTMB/2025/1',
      cookieHeader: 'session=abc'
    }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/403/);
  });

  it('returns HTML response on success', async () => {
    const fakeHtml = '<html><body>results</body></html>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(fakeHtml)
    }));
    const res = await onRequestPost(makeContext({
      url: 'https://itra.run/Races/RaceResults/UTMB/2025/1',
      cookieHeader: 'session=abc'
    }));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toBe(fakeHtml);
  });
});
