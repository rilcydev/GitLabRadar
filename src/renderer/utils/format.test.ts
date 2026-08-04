import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  simpleMarkdown,
  formatDateTime,
  formatTime,
  getAgeInfo,
  getUntagAgeInfo,
} from './format';

const NOW = '2026-08-04T12:00:00Z';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('simpleMarkdown', () => {
  it('returns empty string for falsy input', () => {
    expect(simpleMarkdown('')).toBe('');
  });

  it('escapes raw HTML before applying markdown transforms', () => {
    expect(simpleMarkdown('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('converts ### / ## / # headers', () => {
    expect(simpleMarkdown('### h3')).toBe('<strong style="font-size:12px;">h3</strong>');
    expect(simpleMarkdown('## h2')).toBe('<strong style="font-size:13px;">h2</strong>');
    expect(simpleMarkdown('# h1')).toBe('<strong style="font-size:14px;">h1</strong>');
  });

  it('converts bold **text**', () => {
    expect(simpleMarkdown('**bold**')).toBe('<strong>bold</strong>');
  });

  it('converts italic *text*', () => {
    expect(simpleMarkdown('*italic*')).toBe('<em>italic</em>');
  });

  it('converts inline code `code`', () => {
    expect(simpleMarkdown('`code`')).toBe(
      '<code style="font-family:\'SF Mono\',Monaco,monospace;font-size:11px;background:var(--bg-base);padding:1px 4px;border-radius:3px;">code</code>'
    );
  });

  it('converts links [text](url) with an inline openExternal handler', () => {
    expect(simpleMarkdown('[GitLab](https://gitlab.com)')).toBe(
      '<a href="https://gitlab.com" style="color:var(--accent-purple);text-decoration:none;" onclick="event.stopPropagation();window.gitlabbar.app.openExternal(\'https://gitlab.com\');return false;">GitLab</a>'
    );
  });

  it('converts list items - item / * item to bullets', () => {
    expect(simpleMarkdown('- one')).toBe('&bull; one');
    expect(simpleMarkdown('* two')).toBe('&bull; two');
  });

  it('converts newlines to <br>', () => {
    expect(simpleMarkdown('a\nb')).toBe('a<br>b');
  });

  it('applies bold before italic so **text** does not become nested em tags', () => {
    // The original applies the bold regex first, then the italic regex on the
    // already-bold-wrapped result. Since **text** is consumed entirely by the
    // bold replacement first, no stray single-asterisk italics remain here.
    expect(simpleMarkdown('**bold** and *italic*')).toBe(
      '<strong>bold</strong> and <em>italic</em>'
    );
  });

  it('combines multiple transforms in one call', () => {
    expect(simpleMarkdown('# Title\n**bold** and `code`')).toBe(
      '<strong style="font-size:14px;">Title</strong><br><strong>bold</strong> and <code style="font-family:\'SF Mono\',Monaco,monospace;font-size:11px;background:var(--bg-base);padding:1px 4px;border-radius:3px;">code</code>'
    );
  });
});

describe('formatDateTime', () => {
  const originalTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'UTC';
  });
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('returns empty string for falsy input', () => {
    expect(formatDateTime('')).toBe('');
  });

  it('formats an ISO date as fr-FR dd/mm/yyyy HH:MM', () => {
    expect(formatDateTime('2026-08-04T09:05:00Z')).toBe('04/08/2026 09:05');
  });

  it('zero-pads single-digit day/month/hour/minute', () => {
    expect(formatDateTime('2026-01-02T03:04:00Z')).toBe('02/01/2026 03:04');
  });
});

describe('formatTime', () => {
  it('returns empty string for falsy input', () => {
    expect(formatTime('')).toBe('');
  });

  it('returns "now" for less than a minute ago', () => {
    // 59.999s ago -> minutes = floor(59999/60000) = 0
    expect(formatTime('2026-08-04T11:59:20.001Z')).toBe('now');
  });

  it('returns "now" at 0ms diff', () => {
    expect(formatTime(NOW)).toBe('now');
  });

  it('returns minutes just above the 1-minute boundary', () => {
    // exactly 60000ms ago -> minutes = 1
    expect(formatTime('2026-08-04T11:59:00Z')).toBe('1m');
  });

  it('returns minutes just below the hour boundary', () => {
    // 59 minutes ago -> minutes = 59
    expect(formatTime('2026-08-04T11:01:00Z')).toBe('59m');
  });

  it('rolls over to hours exactly at the 60-minute mark', () => {
    // exactly 3600000ms ago -> minutes = 60 (not < 60), hours = 1
    expect(formatTime('2026-08-04T11:00:00Z')).toBe('1h');
  });

  it('returns hours just below the 24h boundary', () => {
    // 23 hours ago
    expect(formatTime('2026-08-03T13:00:00Z')).toBe('23h');
  });

  it('rolls over to days exactly at the 24-hour mark', () => {
    // exactly 24h ago -> hours = 24 (not < 24), days = 1
    expect(formatTime('2026-08-03T12:00:00Z')).toBe('1d');
  });

  it('returns days for multi-day differences', () => {
    expect(formatTime('2026-07-28T12:00:00Z')).toBe('7d');
  });
});

describe('getAgeInfo', () => {
  it('returns empty classes for falsy input', () => {
    expect(getAgeInfo('')).toEqual({ itemClass: '', badgeClass: '' });
  });

  it('reports fresh for a recent item (hours < 24)', () => {
    expect(getAgeInfo('2026-08-04T09:00:00Z')).toEqual({
      itemClass: 'mr-age-fresh',
      badgeClass: 'fresh',
    });
  });

  it('is still fresh just under the 24h boundary', () => {
    // 23h59m ago -> hours = 23.9833... < 24
    expect(getAgeInfo('2026-08-03T12:00:01Z')).toEqual({
      itemClass: 'mr-age-fresh',
      badgeClass: 'fresh',
    });
  });

  it('rolls over to warning exactly at the 24h boundary', () => {
    // exactly 24h ago -> hours = 24, not < 24, falls into hours < 48 -> warning
    expect(getAgeInfo('2026-08-03T12:00:00Z')).toEqual({
      itemClass: 'mr-age-warning',
      badgeClass: 'warning',
    });
  });

  it('reports warning between 24h and 48h', () => {
    expect(getAgeInfo('2026-08-03T00:00:00Z')).toEqual({
      itemClass: 'mr-age-warning',
      badgeClass: 'warning',
    });
  });

  it('rolls over to alert exactly at the 48h boundary', () => {
    // exactly 48h ago -> hours = 48, not < 48; days = 2, < 7 -> alert
    expect(getAgeInfo('2026-08-02T12:00:00Z')).toEqual({
      itemClass: 'mr-age-alert',
      badgeClass: 'alert',
    });
  });

  it('reports alert for an older item (days < 7)', () => {
    expect(getAgeInfo('2026-07-31T12:00:00Z')).toEqual({
      itemClass: 'mr-age-alert',
      badgeClass: 'alert',
    });
  });

  it('is still alert 1ms short of the 7-day boundary', () => {
    // 1ms less than 7 days ago -> days just under 7 -> alert
    expect(getAgeInfo('2026-07-28T12:00:00.001Z')).toEqual({
      itemClass: 'mr-age-alert',
      badgeClass: 'alert',
    });
  });

  it('rolls over to danger exactly at the 7-day boundary', () => {
    // exactly 7 days ago -> days = 7, not < 7 -> danger
    expect(getAgeInfo('2026-07-28T12:00:00Z')).toEqual({
      itemClass: 'mr-age-danger',
      badgeClass: 'danger',
    });
  });

  it('reports danger between 7 and 30 days', () => {
    expect(getAgeInfo('2026-07-20T12:00:00Z')).toEqual({
      itemClass: 'mr-age-danger',
      badgeClass: 'danger',
    });
  });

  it('rolls over to critical exactly at the 30-day boundary', () => {
    // exactly 30 days ago -> days = 30, not < 30 -> critical
    expect(getAgeInfo('2026-07-05T12:00:00Z')).toEqual({
      itemClass: 'mr-age-critical',
      badgeClass: 'critical',
    });
  });

  it('reports critical for a much older item', () => {
    expect(getAgeInfo('2026-06-01T12:00:00Z')).toEqual({
      itemClass: 'mr-age-critical',
      badgeClass: 'critical',
    });
  });
});

describe('getUntagAgeInfo', () => {
  it('returns empty classes for falsy input', () => {
    expect(getUntagAgeInfo('')).toEqual({ itemClass: '', badgeClass: '' });
  });

  it('reports fresh for less than 1 day', () => {
    expect(getUntagAgeInfo('2026-08-04T09:00:00Z')).toEqual({
      itemClass: 'mr-age-fresh',
      badgeClass: 'fresh',
    });
  });

  it('rolls over to warning exactly at the 1-day boundary', () => {
    // exactly 1 day ago -> days = 1, not < 1 -> warning
    expect(getUntagAgeInfo('2026-08-03T12:00:00Z')).toEqual({
      itemClass: 'mr-age-warning',
      badgeClass: 'warning',
    });
  });

  it('reports warning between 1 and 3 days', () => {
    expect(getUntagAgeInfo('2026-08-02T12:00:00Z')).toEqual({
      itemClass: 'mr-age-warning',
      badgeClass: 'warning',
    });
  });

  it('rolls over to alert exactly at the 3-day boundary', () => {
    // exactly 3 days ago -> days = 3, not < 3 -> alert
    expect(getUntagAgeInfo('2026-08-01T12:00:00Z')).toEqual({
      itemClass: 'mr-age-alert',
      badgeClass: 'alert',
    });
  });

  it('reports alert between 3 and 7 days', () => {
    expect(getUntagAgeInfo('2026-07-30T12:00:00Z')).toEqual({
      itemClass: 'mr-age-alert',
      badgeClass: 'alert',
    });
  });

  it('rolls over to danger exactly at the 7-day boundary', () => {
    // exactly 7 days ago -> days = 7, not < 7 -> danger
    expect(getUntagAgeInfo('2026-07-28T12:00:00Z')).toEqual({
      itemClass: 'mr-age-danger',
      badgeClass: 'danger',
    });
  });

  it('reports danger between 7 and 30 days', () => {
    expect(getUntagAgeInfo('2026-07-20T12:00:00Z')).toEqual({
      itemClass: 'mr-age-danger',
      badgeClass: 'danger',
    });
  });

  it('rolls over to critical exactly at the 30-day boundary', () => {
    // exactly 30 days ago -> days = 30, not < 30 -> critical
    expect(getUntagAgeInfo('2026-07-05T12:00:00Z')).toEqual({
      itemClass: 'mr-age-critical',
      badgeClass: 'critical',
    });
  });

  it('reports critical for a much older tag', () => {
    expect(getUntagAgeInfo('2026-01-01T12:00:00Z')).toEqual({
      itemClass: 'mr-age-critical',
      badgeClass: 'critical',
    });
  });
});
