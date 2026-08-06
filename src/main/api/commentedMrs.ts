/** Minimal shape of a GitLab `action=commented` event we rely on. */
export interface GitLabEvent {
  project_id?: number;
  note?: {
    noteable_type?: string;
    noteable_iid?: number;
  };
}

export interface MrRef {
  projectId: number;
  iid: number;
}

/**
 * Extracts the unique merge requests the current user has commented on, from
 * GitLab `GET /events?action=commented` results. Only note events whose target
 * is a merge request are kept; each (project, iid) appears at most once.
 */
export function extractCommentedMrRefs(events: GitLabEvent[]): MrRef[] {
  const seen = new Set<string>();
  const refs: MrRef[] = [];
  for (const ev of events) {
    const note = ev.note;
    if (note?.noteable_type === 'MergeRequest' && ev.project_id && note.noteable_iid) {
      const key = `${ev.project_id}:${note.noteable_iid}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ projectId: ev.project_id, iid: note.noteable_iid });
      }
    }
  }
  return refs;
}
