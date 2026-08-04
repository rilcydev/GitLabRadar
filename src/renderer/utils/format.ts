/**
 * Formatting helpers ported from the vanilla menubar window
 * (src/renderer/index.html:3574-3667). Strict parity port — no bug fixes,
 * no behaviour changes. See task-12-report.md for the branches and
 * boundaries this preserves.
 */

export interface AgeInfo {
  itemClass: string;
  badgeClass: string;
}

/**
 * HTML-escapes text the same way the original vanilla `escapeHtml` did
 * (via a detached div's textContent -> innerHTML round-trip). This is
 * private to `simpleMarkdown` — it is not exported, and it is not a
 * general-purpose `escapeHtml` for the rest of the app. React escapes
 * interpolated values on its own; nothing else should need this.
 */
function escapeForMarkdown(text: string): string {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

/**
 * Renders a constrained markdown subset to sanitised HTML intended for
 * `dangerouslySetInnerHTML`. Input is escaped first, so any HTML the
 * caller's text contains is neutralised before the markdown transforms
 * run.
 */
export function simpleMarkdown(text: string): string {
  if (!text) return '';
  let html = escapeForMarkdown(text);
  // Headers: ### h3, ## h2, # h1
  html = html.replace(/^### (.+)$/gm, '<strong style="font-size:12px;">$1</strong>');
  html = html.replace(/^## (.+)$/gm, '<strong style="font-size:13px;">$1</strong>');
  html = html.replace(/^# (.+)$/gm, '<strong style="font-size:14px;">$1</strong>');
  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code: `code`
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="font-family:\'SF Mono\',Monaco,monospace;font-size:11px;background:var(--bg-base);padding:1px 4px;border-radius:3px;">$1</code>'
  );
  // Links: [text](url). The URL lands in two different contexts here — a
  // double-quoted HTML attribute value (href, and again inside onclick's
  // attribute value), and a single-quoted JS string literal (inside
  // onclick's decoded JS source) — and escapeForMarkdown() above only
  // escaped &, <, and >, leaving ' and " untouched. Each context needs its
  // own escaping, applied in the right order: JS-string-escape first (so a
  // literal ' can't end the string literal), then HTML-attribute-escape
  // (so a literal " can't end the attribute the JS lives inside) — HTML
  // entities are decoded by the parser before the JS is read, so the two
  // passes cannot be merged or reordered.
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    const hrefUrl = url.replace(/"/g, '&quot;');
    const jsUrl = url
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;');
    return (
      `<a href="${hrefUrl}" style="color:var(--accent-purple);text-decoration:none;" ` +
      `onclick="event.stopPropagation();window.gitlabbar.app.openExternal('${jsUrl}');return false;">` +
      `${label}</a>`
    );
  });
  // List items: - item
  html = html.replace(/^[-*] (.+)$/gm, '&bull; $1');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

/** Formats an ISO date string as fr-FR "dd/mm/yyyy HH:MM" in local time. */
export function formatDateTime(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return (
    date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  );
}

/**
 * Formats an ISO date string as a short relative age: "now", "<N>m",
 * "<N>h", or "<N>d". Each unit rolls over once the finer-grained unit's
 * floored value reaches its threshold (e.g. exactly 60 minutes reports
 * "1h", not "60m"; exactly 24 hours reports "1d", not "24h").
 */
export function formatTime(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

/**
 * Classifies an item's age from its creation date into a CSS item/badge
 * class pair. Thresholds: <24h fresh, <48h warning, <7d alert, <30d danger,
 * else critical.
 */
export function getAgeInfo(createdAt: string): AgeInfo {
  if (!createdAt) return { itemClass: '', badgeClass: '' };
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const hours = diffMs / 3600000;
  const days = hours / 24;

  if (hours < 24) {
    return { itemClass: 'mr-age-fresh', badgeClass: 'fresh' };
  } else if (hours < 48) {
    return { itemClass: 'mr-age-warning', badgeClass: 'warning' };
  } else if (days < 7) {
    return { itemClass: 'mr-age-alert', badgeClass: 'alert' };
  } else if (days < 30) {
    return { itemClass: 'mr-age-danger', badgeClass: 'danger' };
  } else {
    return { itemClass: 'mr-age-critical', badgeClass: 'critical' };
  }
}

/**
 * Classifies a tag's age from its last-tagged date, using thresholds
 * expressed in days rather than hours: <1d fresh, <3d warning, <7d alert,
 * <30d danger, else critical.
 */
export function getUntagAgeInfo(lastTagDate: string): AgeInfo {
  if (!lastTagDate) return { itemClass: '', badgeClass: '' };
  const now = new Date();
  const tagDate = new Date(lastTagDate);
  const diffMs = now.getTime() - tagDate.getTime();
  const hours = diffMs / 3600000;
  const days = hours / 24;

  if (days < 1) {
    return { itemClass: 'mr-age-fresh', badgeClass: 'fresh' };
  } else if (days < 3) {
    return { itemClass: 'mr-age-warning', badgeClass: 'warning' };
  } else if (days < 7) {
    return { itemClass: 'mr-age-alert', badgeClass: 'alert' };
  } else if (days < 30) {
    return { itemClass: 'mr-age-danger', badgeClass: 'danger' };
  } else {
    return { itemClass: 'mr-age-critical', badgeClass: 'critical' };
  }
}
