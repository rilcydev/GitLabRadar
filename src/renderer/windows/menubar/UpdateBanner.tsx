import { useEffect, useState } from 'react';
import type { UpdateInfo } from '@/shared/types';
// Relative import: eslint's import/no-unresolved has no TS-aware resolver for
// the `@/*` alias on value imports (same gap as the rest of the renderer).
import { useApi } from '../../api/ApiContext';
import styles from './UpdateBanner.module.css';

/**
 * Top-of-popup banner shown when a newer GitLabRadar release exists. The main
 * process checks GitHub periodically (see services/updateChecker.ts); this reads
 * the cached result once on mount and links to the release page. Renders nothing
 * when the app is up to date.
 */
export function UpdateBanner() {
  const api = useApi();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

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

  if (!update) return null;

  return (
    <button
      type="button"
      className={styles.updateBanner}
      onClick={() => void api.app.openExternal(update.url)}
      title={`Open the GitLabRadar ${update.version} release`}
    >
      <svg viewBox="0 0 24 24" className={styles.updateIcon} aria-hidden="true">
        <path d="M12 4l-8 8h5v8h6v-8h5z" />
      </svg>
      <span className={styles.updateText}>Update available: v{update.version}</span>
      <span className={styles.updateArrow}>→</span>
    </button>
  );
}
