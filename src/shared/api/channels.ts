export const COMMAND_CHANNELS = {
  accounts: {
    getAll: 'accounts:getAll',
    add: 'accounts:add',
    remove: 'accounts:remove',
    update: 'accounts:update',
    validateToken: 'accounts:validateToken',
  },
  gitlab: {
    getMRs: 'gitlab:getMRs',
    getPipelines: 'gitlab:getPipelines',
    getReleases: 'gitlab:getReleases',
    refresh: 'gitlab:refresh',
    searchProjects: 'gitlab:searchProjects',
    getGroups: 'gitlab:getGroups',
    dismissPipeline: 'gitlab:dismissPipeline',
    restorePipelines: 'gitlab:restorePipelines',
    getMRNotes: 'gitlab:getMRNotes',
    getProjectMembers: 'gitlab:getProjectMembers',
    assignMR: 'gitlab:assignMR',
    addReviewer: 'gitlab:addReviewer',
    dismissMR: 'gitlab:dismissMR',
    restoreMRs: 'gitlab:restoreMRs',
    dismissRelease: 'gitlab:dismissRelease',
    restoreReleases: 'gitlab:restoreReleases',
    getPOReleases: 'gitlab:getPOReleases',
    getUntagProjects: 'gitlab:getUntagProjects',
    refreshUntag: 'gitlab:refreshUntag',
    clearUntagExclusions: 'gitlab:clearUntagExclusions',
  },
  config: {
    get: 'config:get',
    set: 'config:set',
    getAll: 'config:getAll',
  },
  app: {
    openExternal: 'app:openExternal',
    showPreferences: 'app:showPreferences',
    quit: 'app:quit',
    hideMenu: 'app:hideMenu',
  },
} as const;

export const EVENT_CHANNELS = {
  dataUpdated: 'data:updated',
  refreshStatus: 'refresh:status',
  error: 'error:occurred',
  untagDataUpdated: 'untag:dataUpdated',
} as const;

export type CommandNamespace = keyof typeof COMMAND_CHANNELS;
export type EventName = keyof typeof EVENT_CHANNELS;
