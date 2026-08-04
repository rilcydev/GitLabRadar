import type { CSSProperties, ReactNode } from 'react';
import styles from './ItemCard.module.css';

export interface ItemCardProps {
  /**
   * index.html:2830 (`data-url` + a delegated document click listener) is
   * replaced by a direct handler: each row (Tasks 15-17) wires this to
   * `api.app.openExternal(item.webUrl)` itself. A dismiss button (or any
   * other interactive child) stops propagation the normal React way so it
   * doesn't also fire this.
   */
  onClick?: () => void;
  /** Extra class(es) appended after the base `.item` shell, e.g. a row-specific modifier. */
  className?: string;
  /**
   * Plain inline-style passthrough on the `.item` div itself (not usable to
   * target the `::before` accent bar, which is a pseudo-element -- see the
   * comment in ItemCard.module.css about why a CSS-custom-property hook for
   * that was tried and reverted). Optional escape hatch for a consumer that
   * needs one-off overrides without a new CSS Module class.
   */
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * The `.item` shell (index.html:442-476) shared by MR, pipeline and
 * release rows. Deliberately does not own `.item-icon` / `.item-content` /
 * `.item-dismiss` etc. -- those differ in composition per row type (see
 * task-14-report.md) and are left to Tasks 15-17.
 */
export function ItemCard({ onClick, className, style, children }: ItemCardProps) {
  return (
    <div className={className ? `${styles.item} ${className}` : styles.item} style={style} onClick={onClick}>
      {children}
    </div>
  );
}
