import { createContext, useContext, type ReactNode } from 'react';
import type { GitLabBarApi } from '../../shared/api/contract';

const ApiContext = createContext<GitLabBarApi | null>(null);

export function ApiProvider({ api, children }: { api: GitLabBarApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): GitLabBarApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used within an ApiProvider');
  return api;
}
