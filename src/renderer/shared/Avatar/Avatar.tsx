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
 * Three behaviours are DELIBERATELY preserved as-is, not fixed:
 *
 * 1. No `onerror` handler on the <img>. A broken/401 avatar URL renders as
 *    a broken image, not the initial-letter placeholder. This is bug #2 of
 *    the plan's preserved-bug list -- see Avatar.test.tsx for the test that
 *    documents it (fires a real `error` event and asserts the <img> is
 *    still there with no placeholder) so a later change doesn't silently
 *    "fix" it.
 * 2. At item size, the placeholder initial defaults to '?' when the name
 *    is falsy (`(name || '?').charAt(0)`), mirroring index.html:2784's
 *    `(mr.author?.name || '?')[0].toUpperCase()` exactly -- note this is a
 *    different fallback than the item-author-name text next to it, which
 *    uses 'Unknown' (index.html:2835). Do not unify the two; they are
 *    separate strings in the source.
 * 3. At mini size, the placeholder initial has NO such guard -- it mirrors
 *    index.html:2794/:2809's unguarded `a.name[0].toUpperCase()` exactly,
 *    including the crash: an empty/undefined `name` throws
 *    (`''[0]` is `undefined`, `undefined.toUpperCase()` throws). Fix round
 *    1 confirmed this is reachable at runtime, not just a type-system
 *    impossibility: `transformMergeRequest`
 *    (src/main/api/gitlab.ts) only guards at the array level
 *    (`assignees: mr.assignees || []`), and nothing in this repo validates
 *    individual elements against the live GitLab response (no zod/io-ts/
 *    ajv anywhere) -- `MergeRequestAuthor.name: string` is a compile-time
 *    claim, not a runtime guarantee, for data coming off the same
 *    self-hosted instance already known to return surprising 401s. Do NOT
 *    add a `|| '?'` guard here to "fix" this -- see Avatar.test.tsx for the
 *    test documenting the crash, which is bug scoped for the post-migration
 *    lot, not this task.
 *
 * `title` is only ever set at mini size: index.html:2793 and :2808 put a
 * `title="${name}"` tooltip on both the <img> and placeholder <div> for
 * assignee/reviewer mini-avatars; the item-size author avatar
 * (index.html:2783-2784) has no title at all.
 */
export function Avatar({ src, name, size }: AvatarProps) {
  const isMini = size === 'mini';
  const title = isMini ? name : undefined;

  if (src) {
    return (
      <img
        className={isMini ? styles.miniAvatar : styles.itemAvatar}
        src={src}
        alt={name}
        title={title}
      />
    );
  }

  // See point 2/3 above: item size guards a missing name with '?'
  // (index.html:2784); mini size does not (index.html:2794/:2809) and
  // throws on an empty/undefined name exactly as the vanilla does. The
  // non-null assertion on the mini branch is deliberate -- it is what lets
  // `name![0]` reproduce the source's unguarded crash instead of silently
  // tolerating it.
  const initial = isMini ? name![0].toUpperCase() : (name || '?').charAt(0).toUpperCase();

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
