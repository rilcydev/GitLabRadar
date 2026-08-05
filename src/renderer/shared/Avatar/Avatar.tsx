import { useEffect, useState } from 'react';
import styles from './Avatar.module.css';

export type AvatarSize = 'item' | 'mini';

export interface AvatarProps {
  /** Falsy (undefined/empty) renders the initial-letter placeholder instead of an <img>. */
  src: string | undefined;
  /**
   * Widened from the brief's literal `name: string` to `name?: string`
   * because both real call sites hand this straight through from data that
   * is itself optional: index.html:2784 reads `mr.author?.name` (the
   * `MergeRequest.author` field is typed non-optional in
   * src/shared/types/mergeRequest.ts, but the vanilla code guards it
   * defensively anyway with `?.`, so callers may still have nothing to
   * pass here at runtime).
   */
  name?: string;
  /**
   * 'item' = the 28px author avatar (index.html:1158-1180). 'mini' = the
   * 20px avatar used in the assignee/reviewer stacks (index.html:1262-1300).
   */
  size: AvatarSize;
}

/**
 * index.html:2782-2784 (item size, author avatar) and :2791-2796 /
 * :2806-2811 (mini size, assignee/reviewer stacks).
 *
 * Bug-lot fixes applied here (were preserved verbatim from the vanilla
 * source for phase-1 parity):
 *
 * 1. onError fallback (#1/#2): the source had no `onerror` on the <img>, so
 *    a broken/401 avatar URL showed the browser's broken-image glyph. The
 *    <img> now falls back to the initial-letter placeholder on error, and
 *    the error flag resets whenever `src` changes so a later valid URL is
 *    retried.
 * 2. Empty-name guard (#8): the mini-size placeholder used an unguarded
 *    `name![0]`, which threw on an empty/missing name from the live GitLab
 *    response -- and with no error boundary in the tree, that blanked the
 *    whole window. Both sizes now use the same `(name || '?')` guard the
 *    item size always had (index.html:2784).
 *
 * `title` is only ever set at mini size: index.html:2793 and :2808 put a
 * `title="${name}"` tooltip on both the <img> and placeholder <div> for
 * assignee/reviewer mini-avatars; the item-size author avatar
 * (index.html:2783-2784) has no title at all.
 */
export function Avatar({ src, name, size }: AvatarProps) {
  const isMini = size === 'mini';
  const title = isMini ? name : undefined;
  const [errored, setErrored] = useState(false);

  // Reset the error flag when the URL changes so a fresh src is retried
  // instead of being stuck on the placeholder from a previous failure.
  useEffect(() => {
    setErrored(false);
  }, [src]);

  if (src && !errored) {
    return (
      <img
        className={isMini ? styles.miniAvatar : styles.itemAvatar}
        src={src}
        alt={name}
        title={title}
        onError={() => setErrored(true)}
      />
    );
  }

  // '?' guards a missing/empty name at both sizes (index.html:2784).
  const initial = (name || '?').charAt(0).toUpperCase();

  return (
    <div className={isMini ? styles.miniAvatarPlaceholder : styles.itemAvatarPlaceholder} title={title}>
      {initial}
    </div>
  );
}

/**
 * index.html:2796,2811 -- the "+N" chip shown when an assignee/reviewer
 * stack has more than 3 members. Reuses the mini placeholder's exact
 * markup and class (`<div class="mini-avatar-placeholder">+${n}</div>`,
 * no truncation, no title) rather than routing through `Avatar` itself,
 * because the source never runs this text through the initial-letter
 * logic -- it prints the whole "+N" string. Kept in this module (not a
 * fifth shared/ directory) since it is one CSS class away from `Avatar`
 * and has no independent existence in the source.
 */
export function AvatarOverflow({ count }: { count: number }) {
  return <div className={styles.miniAvatarPlaceholder}>{`+${count}`}</div>;
}
