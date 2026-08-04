import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  message: string;
  /**
   * `title`/`icon`/`action` are NOT in the brief's literal
   * `<EmptyState message={string} />` signature. Every real `.empty-state`
   * in the source (index.html:2234-2241 mrs-empty, :2250-2256
   * pipelines-empty, :2265-2272 releases-empty, :2281-2287 untag-empty,
   * :2301-2308 po-empty) is icon + bold title + lighter desc text, and two
   * of the five also have a CTA button ("Configure GitLab" /
   * "Configure projects"). A message-only component would force Tasks
   * 15/17/18 to either drop the title (a visual regression the "strict
   * parity" constraint forbids) or hand-roll the whole empty-state markup
   * themselves, defeating the point of sharing this component. All three
   * additions are optional so `<EmptyState message="..." />` -- the
   * brief's literal example -- still renders correctly with no icon/title/
   * button, exactly as specified.
   */
  title?: string;
  icon?: ReactNode;
  /** e.g. the "Configure GitLab" / "Configure projects" buttons at index.html:2240,2271,2307. */
  action?: ReactNode;
  /**
   * `id`/`titleId`/`messageId` are NOT in the brief's literal
   * `<EmptyState message={string} />` signature, added in Task 15. Every
   * concrete `.empty-state` in the source carries its own DOM id on the
   * container AND (mrs/po) on the title/desc text
   * (index.html:2235,2238-2239 `mrs-empty`/`mrs-empty-title`/`mrs-empty-desc`;
   * :2302,2305-2306 the `po-*` equivalents) that Task 15's MergeRequestsTab
   * needs to reproduce -- ported markup keeps its source id attributes (a
   * rule Task 13 was sent back for dropping). All three are optional so
   * `<EmptyState message="..." />` still renders correctly with no ids,
   * exactly as the brief's minimal example expects.
   */
  id?: string;
  titleId?: string;
  messageId?: string;
}

/** index.html:690-747 (.empty-state and its icon/title/desc/button parts). */
export function EmptyState({ message, title, icon, action, id, titleId, messageId }: EmptyStateProps) {
  return (
    <div className={styles.emptyState} id={id}>
      {icon && <div className={styles.emptyIcon}>{icon}</div>}
      {title && (
        <div className={styles.emptyTitle} id={titleId}>
          {title}
        </div>
      )}
      <div className={styles.emptyDesc} id={messageId}>
        {message}
      </div>
      {action}
    </div>
  );
}
