import { createRoot } from 'react-dom/client';
import { createElectronApi, type IpcLike } from '../../../shared/api/createElectronApi';
import { ApiProvider } from '../../api/ApiContext';
import { PreferencesApp } from './PreferencesApp';
import '../../styles/tokens.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

// window.gitlabradar is exposed by the preload's contextBridge and should
// always be present -- see src/preload.ts and src/global.d.ts. The
// `window.require('electron')` fallback below is not a supported path; it
// exists only so a misconfigured preload fails loudly (a thrown
// "window.require is not a function") instead of silently rendering with
// no API at all.
type ElectronRequire = (id: 'electron') => { ipcRenderer: IpcLike };

const api =
  window.gitlabradar ??
  createElectronApi((window as unknown as { require: ElectronRequire }).require('electron').ipcRenderer);

createRoot(container).render(
  <ApiProvider api={api}>
    <PreferencesApp />
  </ApiProvider>
);
