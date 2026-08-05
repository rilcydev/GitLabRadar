import { describe, it, expect } from 'vitest';
import { mapApprovals, diffApprovers, enrichApprovals } from './approvals';
import type { MergeRequest, MergeRequestAuthor } from '../../shared/types';

const u = (id: number, name: string): MergeRequestAuthor => ({
  id,
  username: name.toLowerCase(),
  name,
  avatar_url: '',
});

describe('mapApprovals', () => {
  it('maps approved_by[].user and approvals_required', () => {
    expect(
      mapApprovals({
        approved_by: [{ user: u(1, 'Alice') }, { user: u(2, 'Bob') }],
        approvals_required: 3,
        approvals_left: 1,
      })
    ).toEqual({ approvedBy: [u(1, 'Alice'), u(2, 'Bob')], approvalsRequired: 3 });
  });

  it('defaults to empty/0 when fields are missing', () => {
    // @ts-expect-error intentionally partial to model a stripped API response
    expect(mapApprovals({})).toEqual({ approvedBy: [], approvalsRequired: 0 });
  });
});

describe('diffApprovers', () => {
  it('returns approvers present in next but not prev (by id)', () => {
    expect(diffApprovers([u(1, 'Alice')], [u(1, 'Alice'), u(2, 'Bob')])).toEqual([u(2, 'Bob')]);
  });

  it('returns nothing when no one new approved', () => {
    expect(diffApprovers([u(1, 'Alice')], [u(1, 'Alice')])).toEqual([]);
  });
});

describe('enrichApprovals', () => {
  const mr = (id: number): MergeRequest => ({
    id,
    iid: id,
    title: 't',
    description: '',
    webUrl: '',
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
  });

  it('fills approvedBy/approvalsRequired from the fetcher', async () => {
    const mrs = [mr(1)];
    await enrichApprovals(mrs, async () => ({ approvedBy: [u(1, 'Alice')], approvalsRequired: 2 }));
    expect(mrs[0].approvedBy).toEqual([u(1, 'Alice')]);
    expect(mrs[0].approvalsRequired).toBe(2);
  });

  it('leaves defaults when the fetcher throws (best-effort)', async () => {
    const mrs = [mr(1)];
    await enrichApprovals(mrs, async () => {
      throw new Error('403');
    });
    expect(mrs[0].approvedBy).toEqual([]);
    expect(mrs[0].approvalsRequired).toBe(0);
  });
});
