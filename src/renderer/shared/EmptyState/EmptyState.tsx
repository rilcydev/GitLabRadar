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
}

/** index.html:690-747 (.empty-state and its icon/title/desc/button parts). */
export function EmptyState({ message, title, icon, action }: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      {icon && <div className={styles.emptyIcon}>{icon}</div>}
      {title && <div className={styles.emptyTitle}>{title}</div>}
      <div className={styles.emptyDesc}>{message}</div>
      {action}
    </div>
  );
}
