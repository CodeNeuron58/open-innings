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
import Purchases, {
  LOG_LEVEL,
  PACKAGE_TYPE,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import { useSession } from './session';

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

/** One buyable plan, with everything the paywall needs to render it. */
export type SupporterPlan = {
  id: string;
  package: PurchasesPackage;
  term: 'annual' | 'monthly' | 'other';
  /** The store's own localised price. Never construct one. */
  priceString: string;
  /**
   * Percent saved against paying monthly for a year, when both plans exist.
   * Derived from the store's numbers rather than written into the copy, so it
   * cannot drift from what Play actually charges.
   */
  savingPercent: number | null;
};

/**
 * Find a package by term.
 *
 * Three levels, because the dashboard can be set up more than one way and a
 * silently-null plan is worse than a slightly ugly lookup:
 *
 *   1. `offering.annual` / `.monthly` — RevenueCat's typed accessors, which
 *      work when the package uses the reserved `$rc_annual` / `$rc_monthly`
 *      identifiers.
 *   2. `packageType`, for the same thing by another route.
 *   3. The product identifier, which is all a **custom** package leaves —
 *      and custom identifiers are what you get if the packages were created
 *      by hand rather than from the standard set.
 *
 * This replaces `availablePackages[0]`, which read whichever package happened
 * to be first. With more than one plan in the offering that is an arbitrary
 * choice of what to charge somebody, which is not a decision to leave to
 * array order.
 */
function findPackage(
  offering: PurchasesOffering,
  term: 'annual' | 'monthly',
): PurchasesPackage | null {
  const typed = term === 'annual' ? offering.annual : offering.monthly;
  if (typed) return typed;

  const wanted = term === 'annual' ? PACKAGE_TYPE.ANNUAL : PACKAGE_TYPE.MONTHLY;
  const byType = offering.availablePackages.find((p) => p.packageType === wanted);
  if (byType) return byType;

  const pattern = term === 'annual' ? /year|annual/i : /month/i;
  return (
    offering.availablePackages.find(
      (p) => pattern.test(p.product.identifier) || pattern.test(p.identifier),
    ) ?? null
  );
}

/** Turn an offering into the plans the paywall shows, best value first. */
function plansFrom(offering: PurchasesOffering | null): SupporterPlan[] {
  if (!offering) return [];

  const annual = findPackage(offering, 'annual');
  const monthly = findPackage(offering, 'monthly');

  /*
   * Anything in the offering that is neither, kept rather than dropped. If a
   * plan is being sold it should be visible — silently hiding one is how a
   * dashboard change becomes a bug nobody can see.
   */
  const named = new Set([annual?.identifier, monthly?.identifier].filter(Boolean));
  const others = offering.availablePackages.filter((p) => !named.has(p.identifier));

  const monthlyPrice = monthly?.product.price ?? 0;
  const savingOn = (pkg: PurchasesPackage, months: number): number | null => {
    if (!monthly || monthlyPrice <= 0 || months <= 0) return null;
    const perMonth = pkg.product.price / months;
    const saved = Math.round((1 - perMonth / monthlyPrice) * 100);
    return saved > 0 ? saved : null;
  };

  const plans: SupporterPlan[] = [];
  if (annual) {
    plans.push({
      id: annual.identifier,
      package: annual,
      term: 'annual',
      priceString: annual.product.priceString,
      savingPercent: savingOn(annual, 12),
    });
  }
  if (monthly) {
    plans.push({
      id: monthly.identifier,
      package: monthly,
      term: 'monthly',
      priceString: monthly.product.priceString,
      savingPercent: null,
    });
  }
  for (const pkg of others) {
    plans.push({
      id: pkg.identifier,
      package: pkg,
      term: 'other',
      priceString: pkg.product.priceString,
      savingPercent: null,
    });
  }
  return plans;
}

export type SupporterState = {
  /** True when the entitlement is active. Ads come down when it is. */
  isSupporter: boolean;
  /** Everything buyable, best value first. Empty when nothing is. */
  plans: SupporterPlan[];
  /** Still asking the store. */
  isLoading: boolean;
  /** Why buying is impossible, when it is. */
  unavailable: string | null;
  purchase: (plan: SupporterPlan) => Promise<{ ok: boolean; message: string | null }>;
  restore: () => Promise<{ ok: boolean; message: string | null }>;
};

const SupporterContext = createContext<SupporterState | null>(null);

export function SupporterProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const userId = user?.id ?? null;

  const [isSupporter, setIsSupporter] = useState(false);
  const [plans, setPlans] = useState<SupporterPlan[]>([]);
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

        /*
         * Tell RevenueCat who this is.
         *
         * `configure` was called with an api key and nothing else, so every
         * install got a fresh anonymous app user id and an entitlement was
         * bound to the device rather than to the account. Meanwhile
         * `/pricing` promised "works on every device you sign in on" and the
         * paywall said "covers every device you sign in on" — neither of
         * which was true: a second phone, or a reinstall, saw nothing until
         * the user found Restore.
         *
         * `logIn` aliases the anonymous id to the account id, so a purchase
         * made on one device is already active on the next one the moment
         * they sign in. Which is what the copy always said.
         *
         * Guests and signed-out users stay anonymous, deliberately — there is
         * no account to attach anything to, and Restore still works off the
         * Play account.
         */
        if (userId) {
          await Purchases.logIn(userId);
        }

        const info = await Purchases.getCustomerInfo();
        const offerings = await Purchases.getOfferings();
        const found = plansFrom(offerings.current ?? null);

        if (cancelled) return;

        setIsSupporter(info.entitlements.active[ENTITLEMENT_ID] !== undefined);
        setPlans(found);
        // No plans means the offering is not marked current, or has no
        // packages in it — the usual state before a first release, and worth
        // saying so rather than showing a dead button.
        setUnavailable(found.length > 0 ? null : 'No plan is available from the store yet.');
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
    // Re-runs on sign-in and sign-out, so the entitlement follows the account.
  }, [userId]);

  const purchase = useCallback(async (plan: SupporterPlan) => {
    try {
      const { customerInfo } = await Purchases.purchasePackage(plan.package);
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
  }, []);

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
    () => ({ isSupporter, plans, isLoading, unavailable, purchase, restore }),
    [isSupporter, plans, isLoading, unavailable, purchase, restore],
  );

  return <SupporterContext.Provider value={value}>{children}</SupporterContext.Provider>;
}

export function useSupporter(): SupporterState {
  const context = useContext(SupporterContext);
  if (!context) throw new Error('useSupporter must be used inside SupporterProvider');
  return context;
}
