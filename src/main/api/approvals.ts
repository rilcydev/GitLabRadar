import type { MergeRequest, MergeRequestAuthor } from '../../shared/types';

export interface GitLabApprovalsResponse {
  approved_by: { user: MergeRequestAuthor }[];
  approvals_required: number;
  approvals_left: number;
}

export interface ApprovalState {
  approvedBy: MergeRequestAuthor[];
  approvalsRequired: number;
}

export function mapApprovals(res: GitLabApprovalsResponse): ApprovalState {
  return {
    approvedBy: (res.approved_by ?? []).map((a) => a.user),
    approvalsRequired: res.approvals_required ?? 0,
  };
}

/** Approvers present in `next` but not `prev`, compared by user id. */
export function diffApprovers(
  prev: MergeRequestAuthor[],
  next: MergeRequestAuthor[]
): MergeRequestAuthor[] {
  const prevIds = new Set(prev.map((a) => a.id));
  return next.filter((a) => !prevIds.has(a.id));
}

/**
 * Enrich each MR in place with its approval state. Best-effort: a failed
 * fetch leaves the MR's defaults and never rejects. Batched to limit
 * concurrency, mirroring the mention-detection loop in polling.ts.
 */
export async function enrichApprovals(
  mrs: MergeRequest[],
  fetchApprovals: (projectId: number, iid: number) => Promise<ApprovalState>,
  batchSize = 5
): Promise<void> {
  for (let i = 0; i < mrs.length; i += batchSize) {
    const batch = mrs.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (mr) => {
        try {
          const state = await fetchApprovals(mr.projectId, mr.iid);
          mr.approvedBy = state.approvedBy;
          mr.approvalsRequired = state.approvalsRequired;
        } catch {
          // best-effort: keep defaults
        }
      })
    );
  }
}
