import type { GitLabRadarApi } from './shared/api/contract';

declare global {
  interface Window {
    gitlabradar: GitLabRadarApi;
  }
}

export {};
