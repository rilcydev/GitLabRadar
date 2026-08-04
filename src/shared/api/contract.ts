import type {
  AppConfig,
  GitLabAccount,
  GitLabAccountInput,
  MergeRequest,
  Pipeline,
  Release,
  UntagProject,
} from '../types';
import { COMMAND_CHANNELS } from './channels';

export type Unsubscribe = () => void;

export type RefreshStatus = 'idle' | 'refreshing' | 'error';

export interface ValidatedUser {
  username: string;
  name: string;
  avatarUrl: string;
}

export interface TokenValidation {
  valid: boolean;
  user?: ValidatedUser;
}

export interface ProjectSearchResult {
  id: number;
  name: string;
  name_with_namespace: string;
  path_with_namespace: string;
  web_url: string;
  default_branch: string;
}

export interface ProjectMember {
  id: number;
  username: string;
  name: string;
  avatar_url: string;
}

export interface MRNote {
  id: number;
  body: string;
  created_at: string;
  author: { id: number; username: string; name: string; avatar_url: string };
}

export interface GitLabGroupSummary {
  id: number;
  name: string;
  path: string;
  full_name: string;
  full_path: string;
  web_url: string;
  parent_id: number | null;
}

export interface PolledData {
  mergeRequests: MergeRequest[];
  pipelines: Pipeline[];
  releases: Release[];
  status: string;
  lastUpdated: string;
}

export interface GitLabBarApi {
  accounts: {
    getAll(): Promise<GitLabAccount[]>;
    add(input: GitLabAccountInput): Promise<GitLabAccount>;
    remove(accountId: string): Promise<void>;
    update(accountId: string, updates: Partial<GitLabAccount>): Promise<void>;
    validateToken(instanceUrl: string, token: string): Promise<TokenValidation>;
  };
  gitlab: {
    getMRs(): Promise<MergeRequest[]>;
    getPipelines(): Promise<Pipeline[]>;
    getReleases(): Promise<Release[]>;
    refresh(): Promise<void>;
    searchProjects(query: string): Promise<ProjectSearchResult[]>;
    getGroups(accountId: string): Promise<GitLabGroupSummary[]>;
    dismissPipeline(pipelineId: number): Promise<void>;
    restorePipelines(): Promise<void>;
    getMRNotes(projectId: number, mrIid: number): Promise<MRNote[]>;
    getProjectMembers(projectId: number): Promise<ProjectMember[]>;
    assignMR(projectId: number, mrIid: number, assigneeIds: number[]): Promise<void>;
    addReviewer(projectId: number, mrIid: number, reviewerIds: number[]): Promise<void>;
    dismissMR(mrId: number): Promise<void>;
    restoreMRs(): Promise<void>;
    dismissRelease(releaseId: number): Promise<void>;
    restoreReleases(): Promise<void>;
    getPOReleases(projectId: number, page: number, perPage: number): Promise<Release[]>;
    getUntagProjects(): Promise<UntagProject[]>;
    refreshUntag(): Promise<void>;
    clearUntagExclusions(): Promise<void>;
  };
  config: {
    get<K extends keyof AppConfig>(key: K): Promise<AppConfig[K]>;
    set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void>;
    getAll(): Promise<AppConfig>;
  };
  app: {
    openExternal(url: string): Promise<void>;
    showPreferences(): Promise<void>;
    quit(): Promise<void>;
    hideMenu(): Promise<void>;
  };
  on: {
    dataUpdated(cb: (data: PolledData) => void): Unsubscribe;
    refreshStatus(cb: (status: RefreshStatus) => void): Unsubscribe;
    error(cb: (message: string) => void): Unsubscribe;
    untagDataUpdated(cb: (data: UntagProject[]) => void): Unsubscribe;
  };
}

// Compile-time guarantee that the manifest and the interface cannot drift.
// If a command is added to one and not the other, `npm run typecheck` fails.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
type AssertExact<T extends true> = T;

export type _AccountsMatch = AssertExact<
  Exact<keyof typeof COMMAND_CHANNELS.accounts, keyof GitLabBarApi['accounts']>
>;
export type _GitlabMatch = AssertExact<
  Exact<keyof typeof COMMAND_CHANNELS.gitlab, keyof GitLabBarApi['gitlab']>
>;
export type _ConfigMatch = AssertExact<
  Exact<keyof typeof COMMAND_CHANNELS.config, keyof GitLabBarApi['config']>
>;
export type _AppMatch = AssertExact<
  Exact<keyof typeof COMMAND_CHANNELS.app, keyof GitLabBarApi['app']>
>;
