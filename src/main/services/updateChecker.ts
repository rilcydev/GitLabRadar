import axios from 'axios';
import { app } from 'electron';
import { checkForUpdate, type GitHubRelease } from './updateCheck';
import type { UpdateInfo } from '../../shared/types';

const RELEASES_LATEST_URL = 'https://api.github.com/repos/Tourniercy/GitLabRadar/releases/latest';
const SIX_HOURS = 6 * 60 * 60 * 1000;
// When the popup asks, re-check at most this often, so opening it gives a
// near-live answer without hitting GitHub's unauthenticated rate limit.
const CHECK_THROTTLE = 10 * 60 * 1000;

let cachedUpdate: UpdateInfo | null = null;
let lastCheckAt = 0;

async function fetchLatestRelease(): Promise<GitHubRelease> {
  const res = await axios.get<GitHubRelease>(RELEASES_LATEST_URL, {
    headers: { Accept: 'application/vnd.github+json' },
    timeout: 10000,
  });
  return res.data;
}

/**
 * The most recent update the app knows about, or null. Triggers a fresh check
 * when the last one is older than CHECK_THROTTLE, so opening the popup gives an
 * up-to-date answer instead of a value cached up to 6h ago; the background
 * timer is only a fallback. The renderer reads this via the
 * `app.getAvailableUpdate` IPC command to decide whether to show the banner.
 */
export async function getAvailableUpdate(): Promise<UpdateInfo | null> {
  if (Date.now() - lastCheckAt > CHECK_THROTTLE) {
    await runUpdateCheck();
  }
  return cachedUpdate;
}

export async function runUpdateCheck(): Promise<void> {
  lastCheckAt = Date.now();
  cachedUpdate = await checkForUpdate(app.getVersion(), fetchLatestRelease);
}

/** Checks immediately, then every `intervalMs`. Best-effort; never throws. */
export function startUpdateChecks(intervalMs: number = SIX_HOURS): void {
  void runUpdateCheck();
  setInterval(() => void runUpdateCheck(), intervalMs);
}
