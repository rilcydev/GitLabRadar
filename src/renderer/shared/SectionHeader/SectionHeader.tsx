import type { ReactNode } from 'react';
import styles from './SectionHeader.module.css';

export interface SectionHeaderProps {
  title: string;
  count: number;
  /**
   * `icon`/`iconBackground` are NOT in the brief's literal
   * `<SectionHeader title count />` signature, added because both real
   * consumers render one: Task 15's four role sections
   * (index.html:2515-2526, `renderSection('To review', ..., 'review', ...)`
   * etc.) each get a colored icon box, and Task 17's per-project
   * release/PO sections (index.html:3178-3185) get a green one with a
   * different icon entirely. Making a title+count-only header would force
   * both tasks to hand-roll the icon box themselves, defeating the point
   * of sharing this component. Both are optional so the brief's minimal
   * two-prop example still renders correctly (no icon box at all).
   */
  icon?: ReactNode;
  /** CSS `background` value for the icon box, e.g. `'var(--gradient-orange)'`. Ignored if `icon` is omitted. */
  iconBackground?: string;
}

/**
 * index.html:397-437 (renderSection's `.section-header`, index.html:2774-2779
 * and the release section header at :3178-3185). Renders the header row
 * only -- the outer `.section` wrapper (index.html:393-395,
 * `margin-bottom: 20px`) and the item list beneath it are composed by the
 * consumer (Tasks 15/17), since what follows the header (which row
 * component, how many, in what order) is entirely tab-specific.
 */
export function SectionHeader({ title, count, icon, iconBackground }: SectionHeaderProps) {
  return (
    <div className={styles.sectionHeader}>
      {icon && (
        <div className={styles.sectionIcon} style={iconBackground ? { background: iconBackground } : undefined}>
          {icon}
        </div>
      )}
      <span className={styles.sectionTitle}>{title}</span>
      <span className={styles.sectionCount}>{count}</span>
    </div>
  );
}
