import { join } from 'node:path';

/**
 * Resolves the directory the RemoteDeckServer serves the deck UI from.
 * Packaged builds carry the pre-built UI via electron-builder
 * extraResources (…/Resources/remote-deck-ui); development builds serve
 * the repo-local `remote-deck-ui/dist` produced by `npm run remote-deck:build`.
 */
export const resolveRemoteDeckStaticDir = (input: {
  isPackaged: boolean;
  resourcesPath: string;
  /** __dirname of the running main bundle (…/dist-electron). */
  appDirname: string;
}): string =>
  input.isPackaged
    ? join(input.resourcesPath, 'remote-deck-ui')
    : join(input.appDirname, '../remote-deck-ui/dist');
