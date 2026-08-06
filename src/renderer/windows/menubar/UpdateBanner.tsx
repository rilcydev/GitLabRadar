import { useCallback, useEffect, useState } from 'react';
import type { UpdateInfo } from '@/shared/types';
// Relative import: eslint's import/no-unresolved has no TS-aware resolver for
// the `@/*` alias on value imports (same gap as the rest of the renderer).
import { useApi } from '../../api/ApiContext';
import styles from './UpdateBanner.module.css';

/** Homebrew is the install path, so this is the one-liner that updates the app. */
const UPDATE_COMMAND = 'brew upgrade --cask gitlabradar';

/**
 * Top-of-popup banner shown when a newer GitLabRadar release exists. The main
 * process checks GitHub periodically (see services/updateChecker.ts); this reads
 * the cached result once on mount. The version links to the release notes, and
 * the button copies the Homebrew update command. Renders nothing when up to date.
 */
export function UpdateBanner() {
  const api = useApi();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const info = await api.app.getAvailableUpdate();
      if (active) setUpdate(info);
    })();
    return () => {
      active = false;
    };
  }, [api]);

  const handleCopy = useCallback(async () => {
    await api.app.copyToClipboard(UPDATE_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [api]);

  if (!update) return null;

  return (
    <div className={styles.updateBanner}>
      <svg viewBox="0 0 24 24" className={styles.updateIcon} aria-hidden="true">
        <path d="M12 4l-8 8h5v8h6v-8h5z" />
      </svg>
      <button
        type="button"
        className={styles.updateInfo}
        onClick={() => void api.app.openExternal(update.url)}
        title="See what's new in this release"
      >
        Update available: v{update.version}
      </button>
      <button
        type="button"
        className={styles.copyButton}
        onClick={() => void handleCopy()}
        title={`Copy "${UPDATE_COMMAND}" to the clipboard`}
      >
        {copied ? '✓ Copied' : 'Copy update command'}
      </button>
    </div>
  );
}
