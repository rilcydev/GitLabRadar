import type { UpdateInfo } from '../../shared/types';

/** Minimal shape of the GitHub "latest release" API response we rely on. */
export interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
}

function parts(version: string): number[] {
  return version
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

/** Numeric semver-ish comparison: is `latest` strictly newer than `current`? */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parts(latest);
  const b = parts(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Best-effort update check. Fetches the latest release via the injected
 * `fetchLatest`, and returns `UpdateInfo` only when it is strictly newer than
 * `currentVersion`. Never throws: a failed fetch, a missing tag, or an
 * up-to-date app all resolve to `null`, so the caller never has to guard.
 */
export async function checkForUpdate(
  currentVersion: string,
  fetchLatest: () => Promise<GitHubRelease>
): Promise<UpdateInfo | null> {
  try {
    const release = await fetchLatest();
    const tag = release.tag_name;
    if (!tag) return null;
    const version = tag.replace(/^v/, '');
    if (!isNewerVersion(version, currentVersion)) return null;
    return { version, url: release.html_url ?? '' };
  } catch {
    return null;
  }
}
