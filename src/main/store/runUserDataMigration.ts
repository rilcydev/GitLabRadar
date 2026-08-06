import { app } from 'electron';
import { existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { migrateUserData } from './migrateUserData';

// Runs at import time, before any electron-store is constructed (tray/polling
// build their stores at module load). `app.getPath('userData')` is available
// pre-`ready`, so this is safe to evaluate here. The legacy directory is the
// old "GitLabBar" product name sitting alongside the current userData path.
const newDir = app.getPath('userData');
const oldDir = join(dirname(newDir), 'GitLabBar');
migrateUserData({ existsSync, renameSync }, oldDir, newDir);
