import type { GitLabBarApi } from './shared/api/contract';

declare global {
  interface Window {
    gitlabbar: GitLabBarApi;
  }
}

export {};
