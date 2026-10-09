// Entry point of the code running in the page's JS context (injected by bootstrap).
// Passive capture of the player's internal requests, feeding the features and debug mode.
import { DEFAULT_SETTINGS } from '../shared/settings';
import { loadLikedIndex, saveLikedIndex, sendToContent, startBridge } from './core/bridge';
import { HashRegistry } from './core/hashRegistry';
import { installFetchInterceptor, installXhrInterceptor, type InterceptorHooks } from './core/interceptor';
import { PathfinderClient } from './core/pathfinderClient';
import { PlayerCommands } from './core/player';
import { currentPage, onPageChange, startRouter } from './core/router';
import { Session } from './core/session';
import { getSettings, onSettingsChange } from './core/settings';
import { installDebugConsole, removeDebugConsole, type DebugConsoleDeps } from './debug/console';
import { logCoverage, startCoverage, stopCoverage } from './debug/coverage';
import { cancelDomProbe, scheduleDomProbe } from './debug/domProbe';
import { debugLog, isDebugEnabled } from './debug/log';
import { mountPanel, unmountPanel } from './debug/panel';
import { clearRecords, flushBuffered, record } from './debug/recorder';
import { logPageChange } from './debug/requestLog';
import { logStartupReport, takeStartupSnapshot } from './debug/startupReport';
import { ArtistLikedSongsFeature } from './features/artist-liked-songs';
import { PlaycountsFeature } from './features/playcounts';

const LOADED = Symbol.for('spotify-full-experience.loaded');

function enterDebug(services: DebugConsoleDeps | null): void {
  startCoverage();
  mountPanel();
  if (services) installDebugConsole(services);
  logPageChange(currentPage());
  scheduleDomProbe(currentPage().kind);
}

function leaveDebug(): void {
  removeDebugConsole();
  stopCoverage();
  cancelDomProbe();
  unmountPanel();
  clearRecords();
}

function main(): void {
  const globals = window as unknown as Record<symbol, unknown>;
  if (globals[LOADED]) return;
  Object.defineProperty(window, LOADED, { value: true });

  // Taken immediately: it must describe the moment the script started, not when settings arrive.
  const startup = takeStartupSnapshot();

  // Features start with their defaults; the settings arrive a few milliseconds later.
  const playcounts = new PlaycountsFeature((width) => sendToContent({ type: 'set-playcounts-title-width', width }));
  if (DEFAULT_SETTINGS.playcounts) playcounts.enable();

  // Until the settings arrive, debug captures go into a small buffer so early requests are not lost.
  // With debug off, only what an enabled feature needs is captured; otherwise the wrappers are pass-through.
  const debugCapturing = () => getSettings()?.debug ?? true;
  // Created below, once the client exists; captures before that only matter to debug and playcounts.
  let likedSongs: ArtistLikedSongsFeature | null = null;
  // Session headers and hashes are taken from every Pathfinder request of the player.
  const session = new Session();
  // Assigned once the native fetch is known; the hook only needs it after that.
  let player: PlayerCommands | null = null;
  const registry = new HashRegistry();
  const hooks: InterceptorHooks = {
    onSpclientRequest: (url, body) => player?.observe(url, body),
    onPathfinderRequest: ({ operationName, hash, headers }) => {
      session.observe(headers);
      registry.observe(operationName, hash);
    },
    shouldCapture: (kind) =>
      debugCapturing() || (kind === 'pathfinder' && (playcounts.isEnabled || likedSongs?.isEnabled === true)),
    onCapture: (capture) => {
      if (debugCapturing()) record(capture);
      for (const feature of [playcounts, likedSongs]) {
        try {
          feature?.onCapture(capture);
        } catch {
          // A failing feature turns itself off silently.
        }
      }
    },
  };
  const nativeFetch = installFetchInterceptor(window, hooks);
  installXhrInterceptor(window, hooks);
  // Our own queries use the unwrapped fetch: they are never mistaken for the player's traffic.
  const client = nativeFetch ? new PathfinderClient(nativeFetch, session, registry) : null;
  const services = client ? { session, registry, client } : null;
  player = nativeFetch ? new PlayerCommands(nativeFetch, session) : null;
  likedSongs = new ArtistLikedSongsFeature({ client, player, loadIndex: loadLikedIndex, saveIndex: saveLikedIndex });
  if (DEFAULT_SETTINGS.likedSongs) likedSongs.enable();
  const liked = likedSongs;
  startCoverage();

  onSettingsChange((settings, previous) => {
    playcounts.setTitleWidth(settings.playcountsTitleWidth);
    if (settings.playcounts) playcounts.enable();
    else playcounts.disable();
    if (settings.likedSongs) liked.enable();
    else liked.disable();

    const wasDebug = previous?.debug ?? false;
    if (settings.debug && !wasDebug) {
      if (previous === null) logStartupReport(startup);
      else debugLog('debug mode enabled');
      enterDebug(services);
      if (previous === null) flushBuffered();
    } else if (!settings.debug && (wasDebug || previous === null)) {
      leaveDebug();
    }
  });

  onPageChange((page) => {
    playcounts.onPageChange(page);
    liked.onPageChange(page);
    if (!isDebugEnabled()) return;
    logCoverage();
    logPageChange(page);
    scheduleDomProbe(page.kind);
  });

  startRouter();
  startBridge();
}

try {
  main();
} catch {
  // Fail-safe: the player must keep working even if our script fails.
}
