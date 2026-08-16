/**
 * Supporter — the one paid thing, and what it does not buy.
 *
 * The product removes advertising. It removes nothing else, and it withholds
 * nothing: every feature in the app is free forever, the whole thing is
 * AGPL-3.0, and a club that would rather self-host pays nothing at all. That
 * is not a marketing position, it is the licence — so the paywall screen can
 * say it plainly and the checklist of free things is longer than the paid one.
 *
 * ## Why this file degrades instead of throwing
 *
 * Three things have to be true before a rupee can change hands: the SDK needs
 * a RevenueCat API key, RevenueCat needs products that exist in Play Console
 * with real pricing, and the app has to be a signed build on a device with
 * Play Billing. Under Metro none of that holds.
 *
 * So every function here answers honestly when it cannot work, and the paywall
 * renders the plan with the purchase button visibly unavailable rather than
 * throwing, hanging, or — worst — appearing to take money it cannot take.
 */
import { useCallback, useEffect, useState } from 'react';
import Purchases, { LOG_LEVEL, type PurchasesPackage } from 'react-native-purchases';

/**
 * The entitlement id configured in the RevenueCat dashboard.
 *
 * If this string and the dashboard ever disagree, purchases succeed and the
 * app never notices — the single most confusing failure in this integration,
 * because everything looks fine on both sides.
 */
export const ENTITLEMENT_ID = 'supporter';

/**
 * The public SDK key. Public by design — it identifies the app to RevenueCat
 * and authorises nothing on its own, which is why it is safe in an
 * EXPO_PUBLIC_ variable compiled into the bundle. The *secret* key is a
 * different string and must never appear here.
 */
const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

export const purchasesConfigured = API_KEY.length > 0;

let started = false;

/** Called once at launch. Safe to call again; safe to call with no key. */
export function initPurchases(): void {
  if (started || !purchasesConfigured) return;
  started = true;

  // Verbose under Metro only — this SDK logs a lot, and in a release build
  // that is noise in someone's logcat rather than information.
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey: API_KEY });
}

export type SupporterState = {
  /** True when the entitlement is active. Ads come down when it is. */
  isSupporter: boolean;
  /** The package to buy, or null when nothing is purchasable here. */
  offering: PurchasesPackage | null;
  /** The store's own localised price string — "₹99", "$1.99". Never hardcode. */
  priceString: string | null;
  /** Still asking the store. */
  isLoading: boolean;
  /**
   * Why buying is impossible, when it is. Rendered to the user, so it says
   * what is actually wrong rather than "an error occurred".
   */
  unavailable: string | null;
  purchase: () => Promise<{ ok: boolean; message: string | null }>;
  restore: () => Promise<{ ok: boolean; message: string | null }>;
};

export function useSupporter(): SupporterState {
  const [isSupporter, setIsSupporter] = useState(false);
  const [offering, setOffering] = useState<PurchasesPackage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!purchasesConfigured) {
        if (!cancelled) {
          setUnavailable('Purchases are not configured in this build yet.');
          setIsLoading(false);
        }
        return;
      }

      try {
        initPurchases();

        const info = await Purchases.getCustomerInfo();
        const offerings = await Purchases.getOfferings();
        const pkg = offerings.current?.availablePackages?.[0] ?? null;

        if (cancelled) return;

        setIsSupporter(info.entitlements.active[ENTITLEMENT_ID] !== undefined);
        setOffering(pkg);
        // An offering with no packages means the products have not been
        // created in Play Console and linked back — the usual state before a
        // first release, and worth saying so rather than showing a dead button.
        setUnavailable(pkg ? null : 'No plan is available from the store yet.');
      } catch (err) {
        if (!cancelled) {
          setUnavailable(err instanceof Error ? err.message : 'Could not reach the store.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const purchase = useCallback(async () => {
    if (!offering) return { ok: false, message: unavailable ?? 'Nothing to buy yet.' };
    try {
      const { customerInfo } = await Purchases.purchasePackage(offering);
      const active = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
      setIsSupporter(active);
      return { ok: active, message: active ? null : 'The purchase did not complete.' };
    } catch (err) {
      // A cancelled purchase is not a failure and must not be reported as one
      // — the user chose to stop, and an error toast would read as a bug.
      if (err && typeof err === 'object' && 'userCancelled' in err && err.userCancelled) {
        return { ok: false, message: null };
      }
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'The purchase failed.',
      };
    }
  }, [offering, unavailable]);

  /**
   * Restore.
   *
   * Required by both stores, and genuinely needed: someone who paid, changed
   * phone, and reinstalled has bought this already.
   */
  const restore = useCallback(async () => {
    if (!purchasesConfigured) return { ok: false, message: 'Purchases are not configured.' };
    try {
      const info = await Purchases.restorePurchases();
      const active = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
      setIsSupporter(active);
      return {
        ok: active,
        message: active ? null : 'No previous purchase found on this account.',
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Could not restore purchases.',
      };
    }
  }, []);

  return {
    isSupporter,
    offering,
    priceString: offering?.product.priceString ?? null,
    isLoading,
    unavailable,
    purchase,
    restore,
  };
}
