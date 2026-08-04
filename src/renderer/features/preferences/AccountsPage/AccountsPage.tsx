import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitLabAccount } from '@/shared/types';
// Relative import: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { useApi } from '../../../api/ApiContext';
import styles from './AccountsPage.module.css';

type StatusType = 'success' | 'error';

interface Status {
  message: string;
  type: StatusType | null;
}

// Ported verbatim from src/renderer/preferences.html:813-852 (markup) and
// the renderAccounts/addAccountBtn handler around :1018-1101 (script).
//
// Parity notes (see task-8-report.md for the full account):
// - preferences.html:1026 renders `(account.name || 'G')[0].toUpperCase()`
//   in a plain <div> for every account, unconditionally -- there is no
//   <img>, no avatarUrl check, and therefore no onerror handler anywhere in
//   this page's account list. `avatarUrl` is simply never read here. This
//   contradicts the task-8 brief's description of an "avatar <img> with no
//   onerror handler" (that pattern does not exist in this file -- verified
//   by grepping the whole file for `avatarUrl`/`account-avatar`). The real
//   source wins: this component never renders an <img> for account avatars.
// - The "delete" flow (:1037-1047) does not check the resolved
//   AccountRemovalResult's `success` field before showing "Account
//   deleted" -- reproduced as-is.
export function AccountsPage() {
  const api = useApi();
  const [accounts, setAccounts] = useState<GitLabAccount[]>([]);
  const [accountName, setAccountName] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('https://gitlab.com');
  const [accessToken, setAccessToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>({ message: '', type: null });
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const all = await api.accounts.getAll();
      setAccounts(all);
    } catch (err) {
      // preferences.html:1059-1061
      console.error('Error loading accounts:', err);
    }
  }, [api]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  // preferences.html:1010-1016. The vanilla version doesn't clear a
  // previous pending timeout before scheduling a new one, and clearing only
  // resets the class (the message text is left in place, just hidden by
  // the base `.status-message` rule having `display: none`) -- reproduced
  // as-is rather than "fixed" to clearTimeout/clear the text.
  const showStatus = useCallback((message: string, type: StatusType) => {
    setStatus({ message, type });
    statusTimeoutRef.current = setTimeout(() => {
      setStatus((current) => ({ ...current, type: null }));
    }, 5000);
  }, []);

  // preferences.html:1065-1101
  const handleAddAccount = useCallback(async () => {
    const name = accountName.trim();
    const url = instanceUrl.trim();
    const token = accessToken.trim();

    if (!name || !url || !token) {
      showStatus('Please fill in all fields', 'error');
      return;
    }

    setSubmitting(true);

    try {
      const validation = await api.accounts.validateToken(url, token);
      if (!validation.valid) {
        showStatus('Invalid token or incorrect URL', 'error');
        return;
      }

      await api.accounts.add({ name, instanceUrl: url, token });
      showStatus('Account added successfully!', 'success');

      setAccountName('');
      setAccessToken('');

      await loadAccounts();
    } catch (err) {
      showStatus('Error: ' + (err instanceof Error ? err.message : 'Unable to add account'), 'error');
    } finally {
      setSubmitting(false);
    }
  }, [accountName, instanceUrl, accessToken, api, showStatus, loadAccounts]);

  // preferences.html:1037-1047
  const handleDeleteAccount = useCallback(
    async (id: string) => {
      if (confirm('Delete this account?')) {
        await api.accounts.remove(id);
        await loadAccounts();
        showStatus('Account deleted', 'success');
      }
    },
    [api, loadAccounts, showStatus]
  );

  const statusClassName = [
    styles.statusMessage,
    status.type === 'success' ? styles.statusMessageSuccess : '',
    status.type === 'error' ? styles.statusMessageError : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>GitLab Accounts</h1>
      <p className={styles.pageDesc}>
        Manage your GitLab connections to track your merge requests and pipelines.
      </p>

      <div className={statusClassName}>{status.message}</div>

      <div className={styles.accountList}>
        {accounts.length > 0 ? (
          accounts.map((account) => (
            <div key={account.id} className={styles.accountItem}>
              <div className={styles.accountAvatar}>{(account.name || 'G')[0].toUpperCase()}</div>
              <div className={styles.accountInfo}>
                <div className={styles.accountName}>{account.name}</div>
                <div className={styles.accountUrl}>{account.instanceUrl}</div>
              </div>
              <button
                type="button"
                className={styles.accountDelete}
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDeleteAccount(account.id);
                }}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
              </button>
            </div>
          ))
        ) : (
          <div className={styles.emptyAccounts}>
            <div className={styles.emptyAccountsIcon}>
              <svg viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
            No accounts configured
          </div>
        )}
      </div>

      <div className={styles.sectionTitle}>New account</div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Account name</label>
        <input
          type="text"
          className={styles.formInput}
          placeholder="E.g.: Personal GitLab"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Instance URL</label>
        <input
          type="text"
          className={styles.formInput}
          placeholder="https://gitlab.com"
          value={instanceUrl}
          onChange={(e) => setInstanceUrl(e.target.value)}
        />
        <div className={styles.formHint}>URL of your GitLab instance (gitlab.com or self-hosted)</div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Personal access token</label>
        <input
          type="password"
          className={styles.formInput}
          placeholder="glpat-xxxxxxxxxxxx"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
        />
        <div className={styles.formHint}>
          Create a token with scope: <strong>api</strong> (required for assign &amp; reviewer actions)
        </div>
      </div>

      <div className={styles.btnGroup}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={submitting}
          onClick={() => void handleAddAccount()}
        >
          {submitting ? 'Validating...' : 'Add account'}
        </button>
      </div>
    </div>
  );
}
