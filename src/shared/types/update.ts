/** A newer released version the running app can be upgraded to. */
export interface UpdateInfo {
  /** The released version, without a leading `v` (e.g. "0.2.4"). */
  version: string;
  /** The GitHub release page URL to open. */
  url: string;
}
