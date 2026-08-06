import { createContext, useContext, type ReactNode } from 'react';
import type { GitLabRadarApi } from '../../shared/api/contract';

const ApiContext = createContext<GitLabRadarApi | null>(null);

export function ApiProvider({ api, children }: { api: GitLabRadarApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): GitLabRadarApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used within an ApiProvider');
  return api;
}
