import type {
  AppConfig,
  GitLabAccount,
  GitLabAccountInput,
  MergeRequest,
  Pipeline,
  Release,
  UntagProject,
  UpdateInfo,
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

// Shapes below match what src/main/ipc/handlers.ts actually resolves for
// each accounts:* command, not the promised value's naive guess.
export interface AccountMutationResult {
  success: boolean;
  account?: GitLabAccount;
  error?: string;
}

export interface AccountRemovalResult {
  success: boolean;
  error?: string;
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
  createdAt: string;
  author: { name: string; username: string; avatar_url: string };
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

// Mirrors src/main/tray.ts's TrayStatus. Not imported: that file is
// main-process code and must not be pulled into the shared/renderer graph.
export type TrayStatus = 'green' | 'orange' | 'red' | 'gray';

export interface PolledData {
  mergeRequests: MergeRequest[];
  pipelines: Pipeline[];
  releases: Release[];
  status: TrayStatus;
  /**
   * Electron delivers `webContents.send` payloads via the HTML structured-clone
   * algorithm, not JSON, so `Date` objects survive the main -> renderer hop
   * intact and arrive here as real `Date` instances (see
   * src/main/services/polling.ts's `PollingData.lastUpdated`). Revisit this
   * when the Tauri implementation lands: Tauri's IPC boundary serializes to
   * JSON, so `Date` will arrive as a string there instead.
   */
  lastUpdated: Date;
  error?: string;
}

// Mirrors src/main/services/untagPolling.ts's `UntagPollingData`. Not
// imported: that file is main-process code and must not be pulled into the
// shared/renderer graph (same reasoning as `TrayStatus` above).
//
// Found while implementing Task 13 (menubar DataProvider): both
// `gitlab.getUntagProjects()` and `on.untagDataUpdated` were typed here as
// resolving/pushing a bare `UntagProject[]`, copied from the brief without
// checking the real handler. In reality:
//   - src/main/ipc/handlers.ts's GITLAB_GET_UNTAG_PROJECTS handler returns
//     `untagPollingService.getData()`, which resolves `UntagPollingData`.
//   - src/main/services/untagPolling.ts:158 pushes that same
//     `UntagPollingData` shape (not just the array) on the
//     `untag:dataUpdated` channel.
//   - src/renderer/index.html:3863-3865 and :3905-3908 both read
//     `data.untagProjects` / `data.excludedCount` off the resolved/pushed
//     value, which only works if the value is the wrapper object, not a bare
//     array (`[].untagProjects` is `undefined`).
// A component written against the OLD (wrong) type signature would compile
// but silently read `undefined` at runtime against the real Electron main
// process -- the exact class of bug the PolledData.lastUpdated Date/string
// note above already warns about, just on a different field. See
// task-13-report.md for the full evidence chain.
export interface UntagPollingResult {
  untagProjects: UntagProject[];
  excludedCount: number;
  lastUpdated: Date;
}

export interface GitLabRadarApi {
  accounts: {
    getAll(): Promise<GitLabAccount[]>;
    add(input: GitLabAccountInput): Promise<AccountMutationResult>;
    remove(accountId: string): Promise<AccountRemovalResult>;
    update(accountId: string, updates: Partial<GitLabAccount>): Promise<AccountMutationResult>;
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
    getUntagProjects(): Promise<UntagPollingResult>;
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
    sendTestNotification(): Promise<void>;
    getAvailableUpdate(): Promise<UpdateInfo | null>;
    copyToClipboard(text: string): Promise<void>;
  };
  on: {
    dataUpdated(cb: (data: PolledData) => void): Unsubscribe;
    refreshStatus(cb: (status: RefreshStatus) => void): Unsubscribe;
    error(cb: (message: string) => void): Unsubscribe;
    untagDataUpdated(cb: (data: UntagPollingResult) => void): Unsubscribe;
  };
}

// Compile-time guarantee that the manifest and the interface cannot drift.
// If a command is added to one and not the other, `npm run typecheck` fails.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AssertExact<T extends true> = T;

export type _AccountsMatch = AssertExact<
  Exact<keyof typeof COMMAND_CHANNELS.accounts, keyof GitLabRadarApi['accounts']>
>;
export type _GitlabMatch = AssertExact<
  Exact<keyof typeof COMMAND_CHANNELS.gitlab, keyof GitLabRadarApi['gitlab']>
>;
export type _ConfigMatch = AssertExact<
  Exact<keyof typeof COMMAND_CHANNELS.config, keyof GitLabRadarApi['config']>
>;
export type _AppMatch = AssertExact<
  Exact<keyof typeof COMMAND_CHANNELS.app, keyof GitLabRadarApi['app']>
>;
