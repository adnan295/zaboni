import AsyncStorage from "@react-native-async-storage/async-storage";

// Asks a happy customer to rate Zaboni on the App Store / Google Play using the
// OS's own in-app review prompt (the OS may still decide not to show it, and
// caps it at a few times a year).
//
// expo-store-review is a native module that only exists in binaries built from
// 1.0.19 on. OTA updates also reach older binaries (same runtimeVersion), where
// requiring it throws — so it is loaded lazily inside try/catch and silently
// skipped there instead of crashing the app.

const LAST_ASKED_KEY = "@zaboni_store_review_last_asked_v1";
const MIN_DAYS_BETWEEN_ASKS = 120;

type StoreReviewModule = {
  isAvailableAsync: () => Promise<boolean>;
  hasAction: () => Promise<boolean>;
  requestReview: () => Promise<void>;
};

function loadStoreReview(): StoreReviewModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-store-review") as StoreReviewModule;
  } catch {
    return null;
  }
}

/** Call after a customer rated an order. Only asks when they were happy. */
export async function maybeRequestStoreReview(restaurantStars: number, courierStars: number): Promise<void> {
  if (restaurantStars < 4 || courierStars < 4) return;
  try {
    const last = Number(await AsyncStorage.getItem(LAST_ASKED_KEY));
    if (last && Date.now() - last < MIN_DAYS_BETWEEN_ASKS * 86_400_000) return;

    const StoreReview = loadStoreReview();
    if (!StoreReview) return;
    if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;

    await AsyncStorage.setItem(LAST_ASKED_KEY, String(Date.now()));
    await StoreReview.requestReview();
  } catch {
    // Never let a review prompt break the rating flow.
  }
}
