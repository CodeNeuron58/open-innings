/**
 * GET /.well-known/assetlinks.json — Android App Links verification.
 *
 * This is what turns a shared scorecard from "opens a browser" into "opens
 * the app". Android fetches this file over HTTPS when the app is installed;
 * if it names the app's package and signing certificate, every
 * `https://openinnings.com/m/…` link opens the app directly, with no
 * disambiguation dialog and no browser bounce.
 *
 * That matters more here than on most sites. The entire growth loop is a link
 * arriving in a WhatsApp group — and the difference between that link opening
 * a web page and opening the app is the difference between a reader and an
 * installed user who can score their own match.
 *
 * ## Why a route rather than a static file
 *
 * The fingerprint is the SHA-256 of the **signing certificate**, which does
 * not exist until an app has been built and signed. Committing a placeholder
 * would ship a file that looks right and silently verifies nothing — the
 * worst kind of wrong, because App Links fail *quietly*: the link just opens
 * a browser and nobody investigates.
 *
 * So the fingerprint comes from `ANDROID_CERT_SHA256`, and until it is set
 * this returns 404 — which is exactly what Android expects from a site that
 * has not claimed an app, and is honest about the state.
 *
 * Get the fingerprint with `eas credentials` (Android → production →
 * "SHA-256 Fingerprint"), or from Play Console once the app is uploaded under
 * Setup → App integrity → App signing.
 *
 * ⚠️ Play App Signing re-signs your upload with **Google's** key. Once the app
 * is on Play, the fingerprint that matters is the one Play Console shows, not
 * the one from your local keystore. Both can be listed — see below.
 */
import { NextResponse } from 'next/server';
import { HTTP } from '@open-innings/shared';

/** Matches `android.package` in apps/mobile/app.json. */
const PACKAGE = 'app.openinnings';

/**
 * Accepts several fingerprints, comma-separated.
 *
 * During the move to Play App Signing there are legitimately two — the
 * upload key and Google's re-signing key — and links break for one set of
 * users if only one is listed.
 */
function fingerprints(): string[] {
  return (process.env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter((f) => f.length > 0);
}

export function GET() {
  const certs = fingerprints();

  if (certs.length === 0) {
    // Nothing claimed yet. A 404 is the correct answer, and better than an
    // empty list, which Android would read as an explicit "no app".
    return NextResponse.json({ error: 'No Android app is linked yet' }, { status: HTTP.notFound });
  }

  return NextResponse.json(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: PACKAGE,
          sha256_cert_fingerprints: certs,
        },
      },
    ],
    {
      status: HTTP.ok,
      headers: {
        // Android caches this; a short TTL means a corrected fingerprint takes
        // effect in hours rather than whenever the OS decides to re-check.
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': 'application/json',
      },
    },
  );
}
