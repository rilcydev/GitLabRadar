import type { MergeRequestAuthor } from '@/shared/types';
import { Avatar, AvatarOverflow } from '../../shared/Avatar/Avatar';
import styles from './ApprovalBadge.module.css';

export interface ApprovalBadgeProps {
  approvedBy: MergeRequestAuthor[];
  approvalsRequired: number;
}

export function ApprovalBadge({ approvedBy, approvalsRequired }: ApprovalBadgeProps) {
  if (approvedBy.length === 0) return null;

  const progress =
    approvalsRequired > 0 ? `${approvedBy.length} / ${approvalsRequired}` : String(approvedBy.length);
  const title = `Approved by ${approvedBy.map((a) => a.name).join(', ')}`;

  return (
    <span className={styles.approvalBadge} title={title}>
      <svg viewBox="0 0 24 24" className={styles.approvalCheck}>
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
      </svg>
      <span className={styles.approvalAvatars}>
        {approvedBy.slice(0, 3).map((a) => (
          <Avatar key={a.id} src={a.avatar_url} name={a.name} size="mini" />
        ))}
        {approvedBy.length > 3 && <AvatarOverflow count={approvedBy.length - 3} />}
      </span>
      <span className={styles.approvalCount}>{progress}</span>
    </span>
  );
}
