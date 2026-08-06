import axios from 'axios';
import { app } from 'electron';
import { checkForUpdate, type GitHubRelease } from './updateCheck';
import type { UpdateInfo } from '../../shared/types';

const RELEASES_LATEST_URL = 'https://api.github.com/repos/Tourniercy/GitLabRadar/releases/latest';
const SIX_HOURS = 6 * 60 * 60 * 1000;

let cachedUpdate: UpdateInfo | null = null;

async function fetchLatestRelease(): Promise<GitHubRelease> {
  const res = await axios.get<GitHubRelease>(RELEASES_LATEST_URL, {
    headers: { Accept: 'application/vnd.github+json' },
    timeout: 10000,
  });
  return res.data;
}

/**
 * The most recent update the app knows about, or null. Populated by
 * `runUpdateCheck`; the renderer reads it via the `app.getAvailableUpdate`
 * IPC command to decide whether to show the update banner.
 */
export function getAvailableUpdate(): UpdateInfo | null {
  return cachedUpdate;
}

export async function runUpdateCheck(): Promise<void> {
  cachedUpdate = await checkForUpdate(app.getVersion(), fetchLatestRelease);
}

/** Checks immediately, then every `intervalMs`. Best-effort; never throws. */
export function startUpdateChecks(intervalMs: number = SIX_HOURS): void {
  void runUpdateCheck();
  setInterval(() => void runUpdateCheck(), intervalMs);
}
