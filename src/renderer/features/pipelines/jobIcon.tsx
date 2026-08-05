import type { ReactNode } from 'react';

/**
 * index.html:3096-3108 (`getJobIcon`), ported verbatim per status ->
 * <svg> markup, including the fallback (`icons[status] || icons.created`)
 * for any status not in the table.
 *
 * IMPORTANT -- this function is DEAD CODE in the source: `getJobIcon` is
 * defined but never called anywhere in index.html, including inside
 * `renderPipelines` itself (verified with `grep -n "getJobIcon" index.html`
 * -- the only two hits are the function's own declaration and its internal
 * `icons[status] || icons.created` line). The job chips `renderPipelines`
 * actually renders (index.html:2970-2976, ported to `PipelineRow`'s
 * `.job-chip`) use a plain colored `.job-status-dot` + the manual-only "▶"
 * text glyph, never one of these SVGs. `getJobIcon`'s own `class="job-icon
 * ..."` output has no matching CSS rule anywhere in index.html either (grep
 * for `.job-icon` turns up nothing beyond this function), reinforcing that
 * it was written but never wired up.
 *
 * Ported anyway, per the brief's explicit instruction to port `getJobIcon`
 * with one test per status -- but NOT called from `PipelineRow`, since doing
 * so would render icons the vanilla app never actually shows next to its
 * job chips, which would be a behaviour change (new visible markup), not a
 * port. See task-16-report.md for this discrepancy.
 */
export function getJobIcon(status: string): ReactNode {
  switch (status) {
    case 'running':
      return (
        <svg className="job-icon running" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0z" />
          <path d="M8 3a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 3z" />
        </svg>
      );
    case 'success':
      return (
        <svg className="job-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
        </svg>
      );
    case 'failed':
      return (
        <svg className="job-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
        </svg>
      );
    case 'pending':
      return (
        <svg className="job-icon" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="8" r="3" />
        </svg>
      );
    case 'skipped':
      return (
        <svg className="job-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.5 3.5a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z" />
        </svg>
      );
    case 'canceled':
      return (
        <svg className="job-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM5.5 5.5h5v5h-5v-5z" />
        </svg>
      );
    case 'manual':
      return (
        <svg className="job-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 4a.75.75 0 0 1 .75.75v6.5a.75.75 0 0 1-1.5 0v-6.5A.75.75 0 0 1 8 4z" />
          <path d="M4.75 7.25a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5z" />
        </svg>
      );
    case 'created':
    default:
      // index.html:3107 -- `icons[status] || icons.created`: any status not
      // in the table above (e.g. a `PipelineStatus`/`JobStatus` value like
      // `waiting_for_resource` or `scheduled` that this table never listed)
      // falls back to the same "created" dot as an explicit `'created'`.
      return (
        <svg className="job-icon" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="8" r="2" />
        </svg>
      );
  }
}
