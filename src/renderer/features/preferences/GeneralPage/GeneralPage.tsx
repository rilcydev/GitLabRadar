import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import type { AppConfig } from '@/shared/types';
// Relative import: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { useApi } from '../../../api/ApiContext';
import styles from './GeneralPage.module.css';

// Ported verbatim from src/renderer/preferences.html:872-974 (markup) and
// the loadSettings/change-listener handlers at :1104-1150 (script).
//
// Parity notes (see task-10-report.md for the full account):
// - preferences.html:956 and :967: `notifyNewMR` and `notifyFailedPipeline`
//   are declared in the markup with a hardcoded `checked` attribute, but
//   grepping the entire inline `<script>` block (and the rest of the repo)
//   for `notifyNewMR`/`notifyFailedPipeline` turns up NOTHING beyond those
//   two markup lines: no `document.getElementById`, no `.checked =` on
//   load, no `addEventListener('change', ...)`. They are dead checkboxes --
//   always rendered checked, freely clickable in the DOM like any native
//   checkbox, but wired to nothing. They never read
//   `notifications.newMRAssigned` / `notifications.pipelineFailed` on load
//   and never write them on change. This contradicts the task-10 brief,
//   which describes them as bound to those two config keys. The source
//   wins per the task instructions -- reproduced here as two uncontrolled
//   `defaultChecked` checkboxes with no `onChange` handler and no config
//   read at all. See task-10-report.md for the full discrepancy writeup.
// - preferences.html:1112: `failedPipelineMaxAge.value = config.failedPipelineMaxAge
//   || 24` uses `||`, which treats the legitimate stored value `0` ("Never
//   hide") as falsy and silently resets the displayed selection to `24` on
//   every reload -- a pre-existing bug, reproduced literally below (not
//   "fixed" to `??`).
export function GeneralPage() {
  const api = useApi();
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [viewMode, setViewMode] = useState<AppConfig['viewMode']>('developer');
  const [refreshInterval, setRefreshInterval] = useState(60000);
  const [failedPipelineMaxAge, setFailedPipelineMaxAge] = useState(24);
  const [showUnassignedMRs, setShowUnassignedMRs] = useState(false);

  // preferences.html:1104-1119
  useEffect(() => {
    (async () => {
      try {
        const config = await api.config.getAll();
        if (config) {
          setLaunchAtStartup(config.launchAtStartup || false);
          setViewMode(config.viewMode || 'developer');
          setRefreshInterval(config.refreshInterval || 60000);
          // Bug reproduced verbatim: `|| 24` treats a stored `0` ("Never
          // hide") as falsy -- see the parity note above.
          setFailedPipelineMaxAge(config.failedPipelineMaxAge || 24);
          setShowUnassignedMRs(config.showUnassignedMRs || false);
        }
      } catch (err) {
        // preferences.html:1116-1118
        console.error('Error loading settings:', err);
      }
    })();
  }, [api]);

  // preferences.html:1122-1126
  const handleLaunchAtStartupChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const checked = e.target.checked;
      setLaunchAtStartup(checked);
      await api.config.set('launchAtStartup', checked);
    },
    [api]
  );

  // preferences.html:1128-1132
  const handleViewModeChange = useCallback(
    async (e: ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value as AppConfig['viewMode'];
      setViewMode(value);
      await api.config.set('viewMode', value);
    },
    [api]
  );

  // preferences.html:1134-1138. `parseInt(refreshInterval.value)` in the
  // source; radix 10 supplied here has no behavioural effect on these
  // values (no leading zero, all decimal) and satisfies the lint radix
  // rule.
  const handleRefreshIntervalChange = useCallback(
    async (e: ChangeEvent<HTMLSelectElement>) => {
      const value = parseInt(e.target.value, 10);
      setRefreshInterval(value);
      await api.config.set('refreshInterval', value);
    },
    [api]
  );

  // preferences.html:1140-1144
  const handleFailedPipelineMaxAgeChange = useCallback(
    async (e: ChangeEvent<HTMLSelectElement>) => {
      const value = parseInt(e.target.value, 10);
      setFailedPipelineMaxAge(value);
      await api.config.set('failedPipelineMaxAge', value);
    },
    [api]
  );

  // preferences.html:1146-1150
  const handleShowUnassignedMRsChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const checked = e.target.checked;
      setShowUnassignedMRs(checked);
      await api.config.set('showUnassignedMRs', checked);
    },
    [api]
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Settings</h1>
      <p className={styles.pageDesc}>Customize GitLabBar&apos;s behavior according to your preferences.</p>

      <div className={styles.sectionTitle}>Application</div>

      <div className={styles.settingsCard}>
        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <div className={styles.toggleLabel}>Launch at startup</div>
            <div className={styles.toggleDesc}>Open GitLabBar automatically when macOS starts</div>
          </div>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              id="launchAtStartup"
              checked={launchAtStartup}
              onChange={(e) => void handleLaunchAtStartupChange(e)}
            />
            <span className={styles.toggleSlider} />
          </label>
        </div>
      </div>

      <div className={styles.sectionTitle}>View mode</div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Interface mode</label>
        <select
          className={styles.formInput}
          id="viewMode"
          value={viewMode}
          onChange={(e) => void handleViewModeChange(e)}
        >
          <option value="developer">Developer</option>
          <option value="productOwner">Product Owner</option>
        </select>
        <div className={styles.formHint}>
          Developer: classic view with MRs, Pipelines and Releases. Product Owner: release-focused view grouped by
          project with deployment status.
        </div>
      </div>

      <div className={styles.sectionTitle}>Refresh</div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Update interval</label>
        <select
          className={styles.formInput}
          id="refreshInterval"
          value={refreshInterval}
          onChange={(e) => void handleRefreshIntervalChange(e)}
        >
          <option value="30000">30 seconds</option>
          <option value="60000">1 minute</option>
          <option value="120000">2 minutes</option>
          <option value="300000">5 minutes</option>
        </select>
      </div>

      <div className={styles.sectionTitle}>Pipelines</div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Hide failed pipelines after</label>
        <select
          className={styles.formInput}
          id="failedPipelineMaxAge"
          value={failedPipelineMaxAge}
          onChange={(e) => void handleFailedPipelineMaxAgeChange(e)}
        >
          <option value="1">1 hour</option>
          <option value="2">2 hours</option>
          <option value="6">6 hours</option>
          <option value="12">12 hours</option>
          <option value="24">24 hours</option>
          <option value="48">48 hours</option>
          <option value="72">72 hours (3 days)</option>
          <option value="168">168 hours (1 week)</option>
          <option value="0">Never hide</option>
        </select>
        <div className={styles.formHint}>Older failed pipelines will not be displayed</div>
      </div>

      <div className={styles.sectionTitle}>Merge Requests</div>

      <div className={styles.settingsCard}>
        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <div className={styles.toggleLabel}>MRs without reviewer</div>
            <div className={styles.toggleDesc}>Show MRs awaiting review without an assigned reviewer</div>
          </div>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              id="showUnassignedMRs"
              checked={showUnassignedMRs}
              onChange={(e) => void handleShowUnassignedMRsChange(e)}
            />
            <span className={styles.toggleSlider} />
          </label>
        </div>
      </div>

      <div className={styles.sectionTitle}>Notifications</div>

      <div className={styles.settingsCard}>
        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <div className={styles.toggleLabel}>New assigned MRs</div>
            <div className={styles.toggleDesc}>Receive a notification when an MR is assigned to you</div>
          </div>
          {/* preferences.html:956: dead checkbox, see the parity note above --
              uncontrolled, hardcoded checked, no onChange, no config I/O. */}
          <label className={styles.toggle}>
            <input type="checkbox" id="notifyNewMR" defaultChecked />
            <span className={styles.toggleSlider} />
          </label>
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <div className={styles.toggleLabel}>Failed pipelines</div>
            <div className={styles.toggleDesc}>Receive a notification when a pipeline fails</div>
          </div>
          {/* preferences.html:967: same dead checkbox as above. */}
          <label className={styles.toggle}>
            <input type="checkbox" id="notifyFailedPipeline" defaultChecked />
            <span className={styles.toggleSlider} />
          </label>
        </div>
      </div>
    </div>
  );
}
