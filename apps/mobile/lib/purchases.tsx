/**
 * Supporter purchases via RevenueCat.
 *
 * A provider rather than a bare hook, and the difference is not tidiness.
 * `useSupporter` used to hold its own state, so every component that called it
 * ran its own `getCustomerInfo()` and `getOfferings()` on mount. `AdBar` is on
 * three screens and `more.tsx` calls it too, so moving between the card, share
 * and cards tabs meant six network round trips to RevenueCat for an answer
 * that cannot change while the app is open — and a visible flicker each time,
 * because `isLoading` renders nothing and then the ad appears underneath the
 * content the reader had already started on.
 *
 * One fetch at launch, shared by everyone, matching `session.tsx` and
 * `settings.tsx`.
 *
 * Degrades gracefully if purchases are not configured or unavailable in this
 * environment — which today is every build, since `eas.json` does not set the
 * key.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Purchases, { LOG_LEVEL, type PurchasesPackage } from 'react-native-purchases';

/** The entitlement id configured in the RevenueCat dashboard. */
export const ENTITLEMENT_ID = 'supporter';

/** The public SDK key for RevenueCat. */
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
  /** Why buying is impossible, when it is. */
  unavailable: string | null;
  purchase: () => Promise<{ ok: boolean; message: string | null }>;
  restore: () => Promise<{ ok: boolean; message: string | null }>;
};

const SupporterContext = createContext<SupporterState | null>(null);

export function SupporterProvider({ children }: { children: ReactNode }) {
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

  /** Restore previous purchases. */
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

  const value = useMemo<SupporterState>(
    () => ({
      isSupporter,
      offering,
      priceString: offering?.product.priceString ?? null,
      isLoading,
      unavailable,
      purchase,
      restore,
    }),
    [isSupporter, offering, isLoading, unavailable, purchase, restore],
  );

  return <SupporterContext.Provider value={value}>{children}</SupporterContext.Provider>;
}

export function useSupporter(): SupporterState {
  const context = useContext(SupporterContext);
  if (!context) throw new Error('useSupporter must be used inside SupporterProvider');
  return context;
}
