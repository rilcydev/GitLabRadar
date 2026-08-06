import { useState, type ReactNode } from 'react';
import { AccountsPage } from '../../features/preferences/AccountsPage/AccountsPage';
import { GeneralPage } from '../../features/preferences/GeneralPage/GeneralPage';
import { ProjectsPage } from '../../features/preferences/ProjectsPage/ProjectsPage';
import styles from './PreferencesApp.module.css';

type Page = 'accounts' | 'projects' | 'general';

interface NavItem {
  page: Page;
  label: string;
  icon: ReactNode;
}

// Icon paths copied verbatim from src/renderer/preferences.html:784-812.
const NAV_ITEMS: NavItem[] = [
  {
    page: 'accounts',
    label: 'Accounts',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    ),
  },
  {
    page: 'projects',
    label: 'Projects',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
      </svg>
    ),
  },
  {
    page: 'general',
    label: 'General',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
      </svg>
    ),
  },
];

export function PreferencesApp() {
  const [page, setPage] = useState<Page>('accounts');

  return (
    <div className={styles.app}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarLogo}>
            <div className={styles.sidebarLogoIcon}>
              <svg viewBox="0 0 24 24">
                <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
              </svg>
            </div>
            <span className={styles.sidebarTitle}>GitLabRadar</span>
          </div>
          <div className={styles.sidebarSubtitle}>Preferences</div>
        </div>

        <nav className={styles.sidebarNav}>
          {NAV_ITEMS.map((item) => (
            <div
              key={item.page}
              className={item.page === page ? `${styles.sidebarItem} ${styles.sidebarItemActive}` : styles.sidebarItem}
              onClick={() => setPage(item.page)}
            >
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}
        </nav>
      </div>

      <div className={styles.main}>
        {page === 'accounts' && <AccountsPage />}
        {page === 'projects' && <ProjectsPage />}
        {page === 'general' && <GeneralPage />}
      </div>
    </div>
  );
}
