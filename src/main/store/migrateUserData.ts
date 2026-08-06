export interface FsLike {
  existsSync(path: string): boolean;
  renameSync(from: string, to: string): void;
}

/**
 * One-shot rename of the legacy per-user data directory to the current one.
 *
 * GitLabRadar previously shipped as "GitLabBar", so Electron stored every
 * setting (config, accounts, encrypted token, window size) under
 * `<appData>/GitLabBar`. Renaming productName moves the default userData path
 * to `<appData>/GitLabRadar`, which would look like a full reset. Moving the
 * directory carries the old data across.
 *
 * Pure and fs-injected so it can be unit-tested without a real Electron app.
 * Only moves when the old dir exists and the new one does not, so it never
 * clobbers data and is a no-op on fresh installs and every launch after the
 * first. Returns whether a move happened.
 */
export function migrateUserData(fs: FsLike, oldDir: string, newDir: string): boolean {
  if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
    fs.renameSync(oldDir, newDir);
    return true;
  }
  return false;
}
