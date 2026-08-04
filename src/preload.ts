import { contextBridge, ipcRenderer } from 'electron';
import { createElectronApi } from './shared/api/createElectronApi';

contextBridge.exposeInMainWorld('gitlabbar', createElectronApi(ipcRenderer));
