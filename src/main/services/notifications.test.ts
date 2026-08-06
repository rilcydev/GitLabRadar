import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  shown: [] as { title: string; body: string }[],
  notif: {
    value: {
      enabled: true,
      newMRAssigned: true,
      mrMentioned: true,
      pipelineStarted: false,
      pipelineFailed: true,
      pipelineSuccess: false,
      mrApproved: true,
    },
  },
}));

vi.mock('electron', () => ({
  Notification: class {
    constructor(public opts: { title: string; body: string }) {}
    on() {
      return this;
    }
    show() {
      h.shown.push({ title: this.opts.title, body: this.opts.body });
    }
    static isSupported() {
      return true;
    }
  },
  shell: { openExternal: vi.fn() },
}));
vi.mock('../store/config', () => ({
  config: { get: (k: string) => (k === 'notifications' ? h.notif.value : undefined) },
}));

import { checkNewApprovals, resetNotificationCache, sendTestNotification } from './notifications';
import type { MergeRequest, MergeRequestAuthor } from '../../shared/types';

const u = (id: number, name: string): MergeRequestAuthor => ({
  id,
  username: name.toLowerCase(),
  name,
  avatar_url: '',
});

const mr = (o: Partial<MergeRequest> = {}): MergeRequest => ({
  id: 1,
  iid: 1,
  title: 'My MR',
  description: '',
  webUrl: 'http://x',
  projectId: 100,
  projectName: '',
  projectPath: '',
  author: u(9, 'Me'),
  userRole: 'author',
  accountId: 'a',
  state: 'opened',
  draft: false,
  createdAt: '',
  updatedAt: '',
  sourceBranch: 's',
  targetBranch: 'main',
  mergeStatus: '',
  hasConflicts: false,
  reviewers: [],
  assignees: [],
  userNotesCount: 0,
  userMentionedInNotes: false,
  approvedBy: [],
  approvalsRequired: 0,
  ...o,
});

beforeEach(() => {
  h.shown.length = 0;
  resetNotificationCache();
  h.notif.value = {
    enabled: true,
    newMRAssigned: true,
    mrMentioned: true,
    pipelineStarted: false,
    pipelineFailed: true,
    pipelineSuccess: false,
    mrApproved: true,
  };
});

describe('checkNewApprovals', () => {
  it('notifies once for a new approver on my MR', () => {
    checkNewApprovals([mr({ approvedBy: [] })], [mr({ approvedBy: [u(1, 'Alice')] })]);
    expect(h.shown).toEqual([{ title: 'MR approved', body: 'Alice approved: My MR' }]);
  });

  it('does not notify for MRs I do not author', () => {
    checkNewApprovals(
      [mr({ userRole: 'reviewer', approvedBy: [] })],
      [mr({ userRole: 'reviewer', approvedBy: [u(1, 'Alice')] })]
    );
    expect(h.shown).toEqual([]);
  });

  it('does not re-notify the same approver (dedupe)', () => {
    const before = [mr({ approvedBy: [] })];
    const after = [mr({ approvedBy: [u(1, 'Alice')] })];
    checkNewApprovals(before, after);
    checkNewApprovals(before, after);
    expect(h.shown).toHaveLength(1);
  });

  it('respects the mrApproved toggle', () => {
    h.notif.value.mrApproved = false;
    checkNewApprovals([mr({ approvedBy: [] })], [mr({ approvedBy: [u(1, 'Alice')] })]);
    expect(h.shown).toEqual([]);
  });
});

describe('sendTestNotification', () => {
  it('shows a test notification immediately', () => {
    sendTestNotification();
    expect(h.shown).toEqual([{ title: 'GitLabRadar', body: 'This is a test notification.' }]);
  });

  it('fires even when notifications are disabled in config (it is a diagnostic)', () => {
    h.notif.value.enabled = false;
    sendTestNotification();
    expect(h.shown).toHaveLength(1);
  });
});
