import { app } from 'electron';
import { config } from '../store/config';

export function setupAutoLaunch(): void {
  const shouldLaunchAtStartup = config.isLaunchAtStartup();
  setAutoLaunch(shouldLaunchAtStartup);
}

export function setAutoLaunch(enabled: boolean): void {
  // In development `app.getPath('exe')` is the Electron binary inside
  // node_modules, and macOS refuses to register it as a login item:
  //
  //   ERROR platform_util_mac.mm: Unable to set login item:
  //   The operation couldn't be completed. Operation not permitted
  //
  // That message comes from Electron's native layer, not from a thrown
  // JavaScript error, so a try/catch around the call does not intercept it —
  // skipping the call is what actually silences it. Registering a login item
  // for a dev build would be wrong anyway: it would point at node_modules.
  //
  // The preference is still persisted either way, so the General page keeps
  // showing what the user chose; only the OS-level registration is deferred
  // until the app is packaged.
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      path: app.getPath('exe'),
    });
  } else {
    console.log(
      `[autolaunch] development build: skipping OS login-item registration ` +
        `(would have set openAtLogin=${enabled})`
    );
  }

  config.setLaunchAtStartup(enabled);
}

export function getAutoLaunchStatus(): boolean {
  const settings = app.getLoginItemSettings();
  return settings.openAtLogin;
}

export function toggleAutoLaunch(): boolean {
  const currentStatus = getAutoLaunchStatus();
  setAutoLaunch(!currentStatus);
  return !currentStatus;
}
