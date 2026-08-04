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

  it('renders a benign URL identically to before the security fix (parity check)', () => {
    // Fix round 1: this exact URL/output pair must not change. If this
    // test breaks, the escaping fix altered normal-case rendering, which
    // it must not.
    expect(simpleMarkdown('[foo](https://gitlab.laddit.io/foo)')).toBe(
      '<a href="https://gitlab.laddit.io/foo" style="color:var(--accent-purple);text-decoration:none;" onclick="event.stopPropagation();window.gitlabbar.app.openExternal(\'https://gitlab.laddit.io/foo\');return false;">foo</a>'
    );
  });

  it('escapes a single quote in the URL so it cannot break out of the onclick JS string literal', () => {
    // Fix round 1 (security). Before the fix, escapeForMarkdown() leaves
    // ' untouched, and the link rule substituted the raw URL straight into
    // a single-quoted JS string inside onclick="...openExternal('$2')...".
    // A URL containing an unescaped ' terminates that string early and lets
    // the rest of the URL run as JS in the menubar's renderer context, with
    // access to window.gitlabbar (32 IPC commands: account add/remove/
    // update, MR assign/dismiss, config writes).
    const payload = "https://evil.example/a';window.__pwned=1;//";
    const html = simpleMarkdown(`[click me](${payload})`);

    expect(html).toBe(
      '<a href="https://evil.example/a\';window.__pwned=1;//" style="color:var(--accent-purple);text-decoration:none;" ' +
        'onclick="event.stopPropagation();window.gitlabbar.app.openExternal(\'https://evil.example/a\\\';window.__pwned=1;//\');return false;">click me</a>'
    );
    // The decoded onclick handler must contain the payload only inside an
    // unbroken, backslash-escaped JS string literal — never as a bare
    // `');` sequence that would close the string and run as a new statement.
    expect(html).not.toContain("a');window.__pwned");
  });

  it('escapes a double quote in the URL so it cannot break out of the HTML attribute or inject a second onclick', () => {
    // Fix round 1 (security). Before the fix, a URL containing an
    // unescaped " terminates the href="..." attribute early (href comes
    // first in the generated tag), letting the rest of the URL be parsed
    // as new HTML attributes on the same <a> — including a second
    // `onclick="..."` that, by HTML's duplicate-attribute rule (first
    // occurrence wins), overrides the app's real onclick handler entirely.
    // A normal click is then enough to run attacker-controlled JS.
    const payload = 'x" onclick="window.__pwned=1';
    const html = simpleMarkdown(`[click me](${payload})`);

    expect(html).toBe(
      '<a href="x&quot; onclick=&quot;window.__pwned=1" style="color:var(--accent-purple);text-decoration:none;" ' +
        'onclick="event.stopPropagation();window.gitlabbar.app.openExternal(\'x&quot; onclick=&quot;window.__pwned=1\');return false;">click me</a>'
    );
    // Exactly one href and one onclick attribute must survive — proof no
    // second (attacker-controlled) attribute was injected into the tag.
    expect(html.match(/\shref="/g)).toHaveLength(1);
    expect(html.match(/\sonclick="/g)).toHaveLength(1);
  });

  it('rejects a javascript: URL, rendering the label as plain text with no link at all', () => {
    // Fix round 2 (security). Approved follow-up to round 1: the onclick
    // guard (stopPropagation + return false) only intercepts a plain left
    // click. Middle-click, ctrl/cmd-click, and the browser's own
    // context-menu "Open Link" all bypass it and can navigate the raw
    // href directly — there is no will-navigate handler in tray.ts to
    // catch what gets through. A javascript: href reached that way runs
    // arbitrary JS in the renderer with window.gitlabbar in scope. Reject
    // by omitting the <a> entirely (not just neutering href) so there is
    // no element for any route to act on.
    expect(simpleMarkdown('[click me](javascript:window.__pwned=1)')).toBe('click me');
  });

  it('rejects a javascript: URL padded with whitespace and mixed-case, not just an exact lowercase match', () => {
    // Fix round 2 (security). A naive `url.startsWith('javascript:')`
    // check would miss this. The scheme check must trim surrounding
    // whitespace and normalise case before comparing.
    expect(simpleMarkdown('[click me](  JaVaScRiPt:window.__pwned=1)')).toBe('click me');
  });

  it('rejects a javascript: URL that hides the scheme name behind an embedded tab', () => {
    // Fix round 2 (security). Browsers strip ASCII tab/CR/LF from anywhere
    // in a URL before parsing its scheme, so "java\tscript:" parses
    // identically to "javascript:". The scheme check must do the same
    // stripping, or this variant walks straight through.
    expect(simpleMarkdown('[click me](java\tscript:window.__pwned=1)')).toBe('click me');
  });

  it('still renders an http: URL exactly as before the scheme allow-list', () => {
    expect(simpleMarkdown('[Docs](http://example.com/docs)')).toBe(
      '<a href="http://example.com/docs" style="color:var(--accent-purple);text-decoration:none;" onclick="event.stopPropagation();window.gitlabbar.app.openExternal(\'http://example.com/docs\');return false;">Docs</a>'
    );
  });

  it('still renders an https: URL exactly as before the scheme allow-list', () => {
    expect(simpleMarkdown('[Docs](https://example.com/docs)')).toBe(
      '<a href="https://example.com/docs" style="color:var(--accent-purple);text-decoration:none;" onclick="event.stopPropagation();window.gitlabbar.app.openExternal(\'https://example.com/docs\');return false;">Docs</a>'
    );
  });

  it('still renders a mailto: URL exactly as before the scheme allow-list', () => {
    expect(simpleMarkdown('[Contact](mailto:person@example.com)')).toBe(
      '<a href="mailto:person@example.com" style="color:var(--accent-purple);text-decoration:none;" onclick="event.stopPropagation();window.gitlabbar.app.openExternal(\'mailto:person@example.com\');return false;">Contact</a>'
    );
  });

  it('preserves the current (pre-fix) output for a relative URL, which has no scheme to reject', () => {
    // Fix round 2: a scheme allow-list must not turn a working relative
    // link into a dead one. [x](/foo) has no scheme at all — it is left
    // untouched by the check, exactly as it rendered before this fix.
    expect(simpleMarkdown('[Home](/foo)')).toBe(
      '<a href="/foo" style="color:var(--accent-purple);text-decoration:none;" onclick="event.stopPropagation();window.gitlabbar.app.openExternal(\'/foo\');return false;">Home</a>'
    );
  });

  it('preserves the current (pre-fix) output for a protocol-relative URL, which has no scheme to reject', () => {
    // Fix round 2: [x](//evil.example) also has no scheme component (it
    // starts with "//", not "letters:") — it cannot resolve to
    // javascript:/data:/etc, so it is out of scope for this check and is
    // left untouched, exactly as it rendered before this fix.
    expect(simpleMarkdown('[CDN](//evil.example/lib.js)')).toBe(
      '<a href="//evil.example/lib.js" style="color:var(--accent-purple);text-decoration:none;" onclick="event.stopPropagation();window.gitlabbar.app.openExternal(\'//evil.example/lib.js\');return false;">CDN</a>'
    );
  });

  describe('rejects javascript: for every C0-control-or-space byte (0x00-0x20) adjacent to the URL', () => {
    // Fix round 3 (security). Round 2's extractUrlScheme used
    // url.trim(), which only strips ECMA-262 whitespace/line-terminator
    // characters (tab, LF, VT, FF, CR, space, plus some Unicode
    // separators) — not the full C0-control range a real URL parser
    // strips. A leading raw control byte outside that narrower set (e.g.
    // \x01, \x08, \x1f) made extractUrlScheme return null (treated as "no
    // scheme", the pass-through path meant for relative URLs), while
    // Chromium/Electron's actual URL parser strips it and resolves the
    // href's protocol to "javascript:" anyway — confirmed independently
    // both via `new URL(...).protocol` and by reading a real anchor's
    // `.protocol` in a DOM. Test the whole class, not a hand-picked few:
    // every code point from 0x00 to 0x20 inclusive, both leading and
    // trailing.
    for (let code = 0x00; code <= 0x20; code++) {
      const char = String.fromCharCode(code);
      const hex = `0x${code.toString(16).padStart(2, '0')}`;

      it(`rejects with control byte ${hex} leading the URL`, () => {
        const html = simpleMarkdown(`[click me](${char}javascript:window.__pwned=1)`);
        expect(html).toBe('click me');
      });

      it(`rejects with control byte ${hex} trailing the URL`, () => {
        const html = simpleMarkdown(`[click me](javascript:window.__pwned=1${char})`);
        expect(html).toBe('click me');
      });
    }
  });

  it('DOM cross-check: a leading C0 control byte really does resolve to javascript: in a real anchor, and simpleMarkdown never produces that anchor', () => {
    // Fix round 3. Tests the property that actually matters — what a real
    // DOM resolves the href to — rather than just the string this module
    // produces. First reproduces the reviewer's own proof (a raw <a> given
    // this href resolves its .protocol to "javascript:", exactly as
    // Chromium/Electron would), then proves simpleMarkdown's fixed output
    // never creates that anchor at all for the same input.
    const payload = '\x01javascript:window.__pwned=1';

    const proofAnchor = document.createElement('a');
    proofAnchor.setAttribute('href', payload);
    expect(proofAnchor.protocol).toBe('javascript:');

    const html = simpleMarkdown(`[click me](${payload})`);
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('a')).toBeNull();
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
    // Fix round 1 (test hygiene): on a machine with no TZ set,
    // originalTz is `undefined`. Assigning `process.env.TZ = undefined`
    // coerces to the string "undefined" rather than removing the key,
    // which would silently force UTC on later Date-sensitive code in the
    // same process under pool: 'forks'/'threads' with singleFork/
    // singleThread (no per-file isolation). Restore by deleting the key
    // when there was no original value.
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
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
