import { Notification, shell } from 'electron';
import { MergeRequest, Pipeline, PipelineStatus } from '../../shared/types';
import { config } from '../store/config';

// Cache to avoid duplicate notifications
const notifiedMRs = new Set<string>();
const notifiedPipelines = new Set<string>();

function getNotificationConfig() {
  return config.get('notifications');
}

/**
 * Shows a notification, and logs it if macOS refuses to display it.
 *
 * Electron 42 migrated macOS notifications from the deprecated
 * NSUserNotification API to UNNotification, which **requires the application to
 * be code-signed**. An app that does not satisfy that check emits a `failed`
 * event instead of showing anything — silently, with nothing surfaced anywhere.
 *
 * This project ad-hoc signs (`osxSign: { identity: '-' }` in forge.config.ts).
 * That satisfied the old API, and restoring notifications was the entire point
 * of the change that introduced it. Whether ad-hoc signing satisfies the new API
 * could not be settled from documentation and cannot be tested without a Mac.
 *
 * So this exists to make the answer observable. If notifications stop appearing
 * after the Electron 43 upgrade, this line in the terminal is the difference
 * between a five-minute diagnosis and an afternoon.
 */
function showNotification(notification: Notification, kind: string): void {
  notification.on('failed', (_event, error: string) => {
    console.error(
      `Notification "${kind}" failed to display: ${error}\n` +
        'If this began after the Electron 43 upgrade, the UNNotification API ' +
        'requires code signing and ad-hoc signing may not satisfy it.'
    );
  });
  notification.show();
}

// How long sendTestNotification() waits for Electron to report an outcome
// before giving up and reporting 'timeout'. Electron does not document a
// case where neither 'show' nor 'failed' fires, but nothing guarantees one
// doesn't exist (e.g. a wedged notification daemon), and a preferences-window
// button that can hang forever is a worse failure mode than an occasional,
// honestly-labelled "timeout". 5 seconds is generous for a local OS call --
// comfortably longer than any real 'show'/'failed' round-trip should take --
// while still keeping the button from hanging indefinitely.
const TEST_NOTIFICATION_TIMEOUT_MS = 5000;

export type TestNotificationOutcome =
  | { status: 'shown' }
  | { status: 'failed'; error: string }
  | { status: 'timeout' };

/**
 * Sends a one-off notification for the preferences window's "Send a test
 * notification" button and resolves with what actually happened, rather
 * than resolving as soon as `.show()` is called -- calling `.show()` only
 * proves the request was made, not that macOS displayed anything (see this
 * file's showNotification() doc comment for why that gap matters here).
 *
 * Races the 'show'/'failed' events against TEST_NOTIFICATION_TIMEOUT_MS so
 * the button cannot hang forever if neither ever fires. Whichever settles
 * first wins; the other is ignored.
 */
export function sendTestNotification(): Promise<TestNotificationOutcome> {
  return new Promise((resolve) => {
    const notification = new Notification({
      title: 'GitLabBar test notification',
      body: 'If you can see this, notifications are working.',
      silent: false,
    });

    let settled = false;
    const settle = (outcome: TestNotificationOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    notification.on('show', () => settle({ status: 'shown' }));
    notification.on('failed', (_event, error: string) => {
      console.error(
        `Test notification failed to display: ${error}\n` +
          'If this began after the Electron 43 upgrade, the UNNotification API ' +
          'requires code signing and ad-hoc signing may not satisfy it.'
      );
      settle({ status: 'failed', error });
    });

    const timer = setTimeout(() => {
      console.error(
        `Test notification: neither "show" nor "failed" fired within ${TEST_NOTIFICATION_TIMEOUT_MS}ms.`
      );
      settle({ status: 'timeout' });
    }, TEST_NOTIFICATION_TIMEOUT_MS);

    notification.show();
  });
}

export function notifyNewMRAssigned(mr: MergeRequest): void {
  const notifConfig = getNotificationConfig();
  if (!notifConfig.enabled || !notifConfig.newMRAssigned) return;

  const key = `mr-assigned-${mr.id}`;
  if (notifiedMRs.has(key)) return;

  const notification = new Notification({
    title: 'New MR assigned',
    body: `${mr.title}\nBy ${mr.author.name}`,
    silent: false,
  });

  notification.on('click', () => {
    shell.openExternal(mr.webUrl);
  });

  showNotification(notification, 'new MR assigned');
  notifiedMRs.add(key);
}

export function notifyMRMentioned(mr: MergeRequest): void {
  const notifConfig = getNotificationConfig();
  if (!notifConfig.enabled || !notifConfig.mrMentioned) return;

  const key = `mr-mentioned-${mr.id}`;
  if (notifiedMRs.has(key)) return;

  const notification = new Notification({
    title: 'You have been mentioned',
    body: `${mr.title}\nIn ${mr.projectName}`,
    silent: false,
  });

  notification.on('click', () => {
    shell.openExternal(mr.webUrl);
  });

  showNotification(notification, 'MR mentioned');
  notifiedMRs.add(key);
}

export function notifyPipelineStarted(pipeline: Pipeline): void {
  const notifConfig = getNotificationConfig();
  if (!notifConfig.enabled || !notifConfig.pipelineStarted) return;

  const key = `pipeline-started-${pipeline.id}`;
  if (notifiedPipelines.has(key)) return;

  const notification = new Notification({
    title: 'Pipeline started',
    body: `${pipeline.projectName}\nBranch: ${pipeline.ref}`,
    silent: false,
  });

  notification.on('click', () => {
    shell.openExternal(pipeline.webUrl);
  });

  showNotification(notification, 'pipeline started');
  notifiedPipelines.add(key);
}

export function notifyPipelineFailed(pipeline: Pipeline): void {
  const notifConfig = getNotificationConfig();
  if (!notifConfig.enabled || !notifConfig.pipelineFailed) return;

  const key = `pipeline-failed-${pipeline.id}`;
  if (notifiedPipelines.has(key)) return;

  const notification = new Notification({
    title: 'Pipeline failed',
    body: `${pipeline.projectName}\nBranch: ${pipeline.ref}`,
    silent: false,
    urgency: 'critical',
  });

  notification.on('click', () => {
    shell.openExternal(pipeline.webUrl);
  });

  showNotification(notification, 'pipeline failed');
  notifiedPipelines.add(key);
}

export function notifyPipelineSuccess(pipeline: Pipeline): void {
  const notifConfig = getNotificationConfig();
  if (!notifConfig.enabled || !notifConfig.pipelineSuccess) return;

  const key = `pipeline-success-${pipeline.id}`;
  if (notifiedPipelines.has(key)) return;

  const notification = new Notification({
    title: 'Pipeline succeeded',
    body: `${pipeline.projectName}\nBranch: ${pipeline.ref}`,
    silent: false,
  });

  notification.on('click', () => {
    shell.openExternal(pipeline.webUrl);
  });

  showNotification(notification, 'pipeline succeeded');
  notifiedPipelines.add(key);
}

export function checkPipelineStatusChange(
  oldPipelines: Pipeline[],
  newPipelines: Pipeline[]
): void {
  const oldMap = new Map(oldPipelines.map((p) => [p.id, p]));

  for (const newPipeline of newPipelines) {
    const oldPipeline = oldMap.get(newPipeline.id);

    if (!oldPipeline) {
      // New pipeline
      if (newPipeline.status === 'running') {
        notifyPipelineStarted(newPipeline);
      }
    } else if (oldPipeline.status !== newPipeline.status) {
      // Status change
      if (newPipeline.status === 'running') {
        notifyPipelineStarted(newPipeline);
      } else if (newPipeline.status === 'failed') {
        notifyPipelineFailed(newPipeline);
      } else if (newPipeline.status === 'success') {
        notifyPipelineSuccess(newPipeline);
      }
    }
  }
}

export function checkNewMRs(oldMRs: MergeRequest[], newMRs: MergeRequest[]): void {
  const oldIds = new Set(oldMRs.map((mr) => mr.id));

  for (const mr of newMRs) {
    if (!oldIds.has(mr.id)) {
      if (mr.userRole === 'assignee') {
        notifyNewMRAssigned(mr);
      } else if (mr.userRole === 'mentioned') {
        notifyMRMentioned(mr);
      }
    }
  }
}

// Clean cache periodically (keep only the last 1000 entries)
export function cleanNotificationCache(): void {
  if (notifiedMRs.size > 1000) {
    const entries = Array.from(notifiedMRs);
    entries.slice(0, entries.length - 500).forEach((key) => notifiedMRs.delete(key));
  }
  if (notifiedPipelines.size > 1000) {
    const entries = Array.from(notifiedPipelines);
    entries.slice(0, entries.length - 500).forEach((key) => notifiedPipelines.delete(key));
  }
}

// Reset cache (useful for tests)
export function resetNotificationCache(): void {
  notifiedMRs.clear();
  notifiedPipelines.clear();
}
