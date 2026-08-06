import { contextBridge, ipcRenderer } from 'electron';
import { createElectronApi } from './shared/api/createElectronApi';

contextBridge.exposeInMainWorld('gitlabradar', createElectronApi(ipcRenderer));
