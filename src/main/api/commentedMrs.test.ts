import { describe, it, expect } from 'vitest';
import { extractCommentedMrRefs } from './commentedMrs';

describe('extractCommentedMrRefs', () => {
  it('keeps MR comment events as unique (project, iid) refs', () => {
    const refs = extractCommentedMrRefs([
      { project_id: 1, note: { noteable_type: 'MergeRequest', noteable_iid: 5 } },
    ]);
    expect(refs).toEqual([{ projectId: 1, iid: 5 }]);
  });

  it('ignores comments on issues, commits, and other targets', () => {
    const refs = extractCommentedMrRefs([
      { project_id: 1, note: { noteable_type: 'Issue', noteable_iid: 9 } },
      { project_id: 2, note: { noteable_type: 'Commit', noteable_iid: 3 } },
    ]);
    expect(refs).toEqual([]);
  });

  it('deduplicates repeated comments on the same MR', () => {
    const refs = extractCommentedMrRefs([
      { project_id: 1, note: { noteable_type: 'MergeRequest', noteable_iid: 5 } },
      { project_id: 1, note: { noteable_type: 'MergeRequest', noteable_iid: 5 } },
      { project_id: 1, note: { noteable_type: 'MergeRequest', noteable_iid: 6 } },
    ]);
    expect(refs).toEqual([
      { projectId: 1, iid: 5 },
      { projectId: 1, iid: 6 },
    ]);
  });

  it('skips events missing a project id, a note, or an iid', () => {
    const refs = extractCommentedMrRefs([
      { note: { noteable_type: 'MergeRequest', noteable_iid: 5 } },
      { project_id: 1, note: { noteable_type: 'MergeRequest' } },
      { project_id: 1 },
      {},
    ]);
    expect(refs).toEqual([]);
  });
});
