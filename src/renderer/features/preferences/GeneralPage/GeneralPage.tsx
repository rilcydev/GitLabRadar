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
// Bug-lot fixes (previously reproduced from the vanilla source for phase-1
// parity, now corrected):
// - Notifications (#6): `notifyNewMR` / `notifyFailedPipeline` were dead
//   checkboxes in the source (hardcoded `checked`, no config I/O). They are
//   now controlled by `notifications.newMRAssigned` /
//   `notifications.pipelineFailed`, loaded on mount and persisted on change.
// - failedPipelineMaxAge (#7): the source used `|| 24`, treating a stored
//   `0` ("Never hide") as falsy and reverting the display to 24 on reload.
//   Now `?? 24`, so only null/undefined falls back to the default.
export function GeneralPage() {
  const api = useApi();
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [viewMode, setViewMode] = useState<AppConfig['viewMode']>('developer');
  const [refreshInterval, setRefreshInterval] = useState(60000);
  const [failedPipelineMaxAge, setFailedPipelineMaxAge] = useState(24);
  const [showUnassignedMRs, setShowUnassignedMRs] = useState(false);
  const [notifications, setNotifications] = useState<AppConfig['notifications']>({
    enabled: true,
    newMRAssigned: true,
    mrMentioned: true,
    pipelineStarted: false,
    pipelineFailed: true,
    pipelineSuccess: false,
    mrApproved: true,
  });

  // preferences.html:1104-1119
  useEffect(() => {
    (async () => {
      try {
        const config = await api.config.getAll();
        if (config) {
          setLaunchAtStartup(config.launchAtStartup || false);
          setViewMode(config.viewMode || 'developer');
          setRefreshInterval(config.refreshInterval || 60000);
          // Fixed (bug lot): `?? 24` so a stored `0` ("Never hide") survives a
          // reload; only null/undefined falls back to the 24h default.
          setFailedPipelineMaxAge(config.failedPipelineMaxAge ?? 24);
          setShowUnassignedMRs(config.showUnassignedMRs || false);
          if (config.notifications) setNotifications(config.notifications);
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

  // Bug-lot fix (#6): the two notification toggles now read from and write to
  // config.notifications instead of being inert.
  const handleNotifyNewMRChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const next = { ...notifications, newMRAssigned: e.target.checked };
      setNotifications(next);
      await api.config.set('notifications', next);
    },
    [api, notifications]
  );

  const handleNotifyFailedPipelineChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const next = { ...notifications, pipelineFailed: e.target.checked };
      setNotifications(next);
      await api.config.set('notifications', next);
    },
    [api, notifications]
  );

  const handleNotifyApprovedChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const next = { ...notifications, mrApproved: e.target.checked };
      setNotifications(next);
      await api.config.set('notifications', next);
    },
    [api, notifications]
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Settings</h1>
      <p className={styles.pageDesc}>Customize GitLabRadar&apos;s behavior according to your preferences.</p>

      <div className={styles.sectionTitle}>Application</div>

      <div className={styles.settingsCard}>
        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <div className={styles.toggleLabel}>Launch at startup</div>
            <div className={styles.toggleDesc}>Open GitLabRadar automatically when macOS starts</div>
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
          <label className={styles.toggle}>
            <input
              type="checkbox"
              id="notifyNewMR"
              checked={notifications.newMRAssigned}
              onChange={(e) => void handleNotifyNewMRChange(e)}
            />
            <span className={styles.toggleSlider} />
          </label>
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <div className={styles.toggleLabel}>Failed pipelines</div>
            <div className={styles.toggleDesc}>Receive a notification when a pipeline fails</div>
          </div>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              id="notifyFailedPipeline"
              checked={notifications.pipelineFailed}
              onChange={(e) => void handleNotifyFailedPipelineChange(e)}
            />
            <span className={styles.toggleSlider} />
          </label>
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <div className={styles.toggleLabel}>MR approved</div>
            <div className={styles.toggleDesc}>Receive a notification when someone approves your MR</div>
          </div>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              id="notifyMRApproved"
              checked={notifications.mrApproved}
              onChange={(e) => void handleNotifyApprovedChange(e)}
            />
            <span className={styles.toggleSlider} />
          </label>
        </div>
      </div>
    </div>
  );
}
