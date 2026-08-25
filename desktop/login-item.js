import { execFileSync } from 'node:child_process';
import { loginItemOptions } from './runtime-paths.js';

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const STARTUP_APPROVED_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
const LOGIN_ITEM_NAME = 'Wattelier';

/**
 * @param {string} key
 * @param {string} name
 * @returns {{ found: boolean, value: string } | null}
 */
function queryWindowsRegistryValue(key, name) {
  try {
    const output = execFileSync('reg.exe', ['query', key, '/v', name], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const value = output.match(/\bREG_(?:SZ|EXPAND_SZ|BINARY)\s+(.+)$/m)?.[1]?.trim();
    return value ? { found: true, value } : null;
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 1) {
      return { found: false, value: '' };
    }
    return null;
  }
}

/**
 * Lit l’entrée exacte créée par Wattelier. Cette lecture contourne les faux
 * négatifs de getLoginItemSettings() avec les chemins Windows entre guillemets.
 *
 * @param {string} executablePath
 * @param {(key: string, name: string) => { found: boolean, value: string } | null} [queryRegistry]
 * @returns {boolean | null}
 */
export function readWindowsLoginItemState(
  executablePath,
  queryRegistry = queryWindowsRegistryValue,
) {
  const runEntry = queryRegistry(RUN_KEY, LOGIN_ITEM_NAME);
  if (!runEntry) return null;
  if (!runEntry.found) return false;

  const expectedCommand = `"${executablePath}" --hidden`.toLocaleLowerCase('en-US');
  if (runEntry.value.trim().toLocaleLowerCase('en-US') !== expectedCommand) return false;

  const approval = queryRegistry(STARTUP_APPROVED_KEY, LOGIN_ITEM_NAME);
  if (!approval) return null;
  if (!approval.found) return true;
  return approval.value.replace(/\s/g, '').toLowerCase().startsWith('02');
}

/**
 * Retourne l’état effectif du démarrage automatique sous Windows.
 *
 * @param {{ getLoginItemSettings: (options: { path: string, args: string[] }) => { openAtLogin: boolean, executableWillLaunchAtLogin: boolean } }} electronApp
 * @param {string} executablePath
 * @param {((executablePath: string) => boolean | null) | null} [readRegistryState]
 */
export function readOpenAtLogin(electronApp, executablePath, readRegistryState) {
  const { path, args } = loginItemOptions(executablePath);
  const settings = electronApp.getLoginItemSettings({ path, args });
  const electronState = Boolean(settings.openAtLogin && settings.executableWillLaunchAtLogin);
  const registryState =
    readRegistryState === null
      ? null
      : (
          readRegistryState ||
          (process.platform === 'win32' ? readWindowsLoginItemState : () => null)
        )(executablePath);
  return registryState ?? electronState;
}

/**
 * Active ou désactive l’entrée de démarrage et vérifie que Windows a appliqué
 * la demande, notamment dans la clé StartupApproved.
 *
 * @param {{ setLoginItemSettings: (options: object) => void, getLoginItemSettings: (options: { path: string, args: string[] }) => { openAtLogin: boolean, executableWillLaunchAtLogin: boolean } }} electronApp
 * @param {string} executablePath
 * @param {boolean} enabled
 * @param {((executablePath: string) => boolean | null) | null} [readRegistryState]
 */
export function updateOpenAtLogin(electronApp, executablePath, enabled, readRegistryState) {
  const desiredState = Boolean(enabled);
  electronApp.setLoginItemSettings({
    ...loginItemOptions(executablePath),
    openAtLogin: desiredState,
    enabled: desiredState,
  });

  const effectiveState = readOpenAtLogin(electronApp, executablePath, readRegistryState);
  if (effectiveState !== desiredState) {
    throw new Error(
      desiredState
        ? 'Windows n’a pas activé le démarrage automatique. Vérifiez Paramètres → Applications → Démarrage.'
        : 'Windows n’a pas désactivé le démarrage automatique. Vérifiez Paramètres → Applications → Démarrage.',
    );
  }
  return effectiveState;
}
