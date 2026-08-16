/**
 * Where the API lives.
 *
 * Resolution order:
 *   1. EXPO_PUBLIC_API_URL — set this for closed testing and production.
 *      Expo inlines EXPO_PUBLIC_* at build time.
 *   2. In dev, the LAN address Metro is already serving from. A phone can't
 *      reach `localhost` — that's the phone itself — but it is on the same
 *      wifi as the dev machine, and Metro knows that machine's address. So
 *      `pnpm dev` in apps/web plus `pnpm start` here just works, with nothing
 *      to configure and no IP to hardcode and forget about.
 */
import Constants from 'expo-constants';

const DEV_WEB_PORT = 3000;

function metroHost(): string | null {
  // hostUri is "192.168.1.42:8081" in a dev build; debuggerHost is the Expo Go
  // equivalent. Either gives us the dev machine's address on the local network.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;

  const host = hostUri?.split(':')[0];
  return host && host.length > 0 ? host : null;
}

function resolveApiBase(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');

  const host = metroHost();
  if (host) return `http://${host}:${DEV_WEB_PORT}`;

  // Not fatal at import time — surfaces as a network error with a message
  // that says what to do, rather than a mystery fetch failure.
  return '';
}

export const API_BASE = resolveApiBase();

export const MISSING_API_BASE_MESSAGE =
  'No API URL. Set EXPO_PUBLIC_API_URL, or run the Expo dev server on the same network as the web app.';

/**
 * Public links — the scorecard and the share cards.
 *
 * The same origin as the API, because the web app serves both `/api` and the
 * public pages. That makes shared links correct everywhere for free: in
 * production `EXPO_PUBLIC_API_URL` is the real domain, and in dev it is the
 * LAN address, which opens on any phone on the same wifi — which is exactly
 * what you want when testing whether a scorecard is worth sending to anyone.
 */
export const shareUrls = {
  match: (matchId: string) => `${API_BASE}/m/${matchId}`,
  playerInMatch: (matchId: string, playerId: string) => `${API_BASE}/m/${matchId}/p/${playerId}`,
  player: (playerId: string) => `${API_BASE}/p/${playerId}`,
  club: (teamId: string) => `${API_BASE}/c/${teamId}`,

  /*
   * The scorebook as a file.
   *
   * Opened in the browser rather than downloaded in-app: writing a file to
   * the device needs expo-file-system plus a storage permission, and the
   * browser already knows how to save a download and hand it to whatever the
   * person wants to open it with.
   */
  exportMatch: (matchId: string, format: 'csv' | 'json') =>
    `${API_BASE}/api/matches/${matchId}/export?format=${format}`,

  /*
   * The card images themselves — the 1080×1080 PNGs Satori renders.
   *
   * `opengraph-image` is Next's own convention: the file
   * `app/m/[matchId]/opengraph-image.tsx` is served at this path. The share
   * screens point an <Image> straight at it, so the preview a scorer sees is
   * the exact bytes WhatsApp will render rather than a second drawing of the
   * same card that can drift from it.
   */
  matchCardImage: (matchId: string) => `${API_BASE}/m/${matchId}/opengraph-image`,
  playerCardImage: (matchId: string, playerId: string) =>
    `${API_BASE}/m/${matchId}/p/${playerId}/opengraph-image`,
};

/**
 * The shape of those cards: 1200 × 630.
 *
 * That is the Open Graph size, because the cards were built to be the preview
 * a link unfurls into. The designs ask for 1080 × 1080 — the square an image
 * wants when it is sent *as an image* to WhatsApp or Instagram — and no square
 * variant exists yet.
 *
 * So the previews are drawn at the real ratio rather than boxed into a square
 * they are not. Getting this wrong is not cosmetic: a preview that lies about
 * the crop sends someone a card with their name cut off. See docs/wiring.md.
 */
export const CARD_ASPECT_RATIO = 1200 / 630;
