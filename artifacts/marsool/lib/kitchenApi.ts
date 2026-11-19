// Client for the pre-order "بيتي وصحّي" section. The section only exists when the
// server says it is enabled, so every screen starts from `fetchKitchenConfig`.
import { customFetch, ApiError } from "@workspace/api-client-react";

export type MealSection = "home" | "healthy" | "dessert";
export type SubscriptionGoal = "cut" | "balanced" | "home";

export interface KitchenDay { day: string; open: boolean; closesAt: string }

export interface KitchenConfig {
  enabled: boolean;
  title?: string;
  cutoffHour?: number;
  windows?: string[];
  subscriptionDiscountPct?: number;
  minSubscriptionDays?: number;
  days?: KitchenDay[];
}

export interface KitchenMeal {
  id: string;
  kitchenId: string;
  kitchenName: string;
  kitchenRating: number;
  kitchenReviewCount: number;
  nameAr: string;
  descriptionAr: string;
  image: string;
  price: number;
  section: MealSection;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  tags: string[];
  portions: number;
  left: number;
}

export interface KitchenMenu { day: string; open: boolean; closesAt: string; days: KitchenDay[]; meals: KitchenMeal[] }
export interface KitchenMealDetail { meal: KitchenMeal; day: string; open: boolean; closesAt: string | null; windows: string[] }
export interface PlacedKitchenOrder { id: string; kitchenName: string; day: string; window: string; itemsTotal: number; deliveryFee: number }
export interface KitchenSubscription {
  id: string; goal: SubscriptionGoal; daysCount: number; discountPct: number; window: string; status: string;
  upcoming: number; delivered: number; orders: { id: string; day: string; status: string; text: string }[];
}

export const fetchKitchenConfig = async (): Promise<KitchenConfig> => {
  try {
    return (await customFetch("/api/kitchen/config")) as KitchenConfig;
  } catch {
    // Older servers have no such route: the section simply does not exist.
    return { enabled: false };
  }
};

export const fetchKitchenMenu = (day?: string) =>
  customFetch(`/api/kitchen/menu${day ? `?day=${day}` : ""}`) as Promise<KitchenMenu>;

export const fetchKitchenMeal = (id: string, day: string) =>
  customFetch(`/api/kitchen/meals/${encodeURIComponent(id)}?day=${day}`) as Promise<KitchenMealDetail>;

export interface DeliveryTarget { address: string; lat: number; lon: number }

export const placeKitchenOrder = (input: DeliveryTarget & { day: string; window: string; items: { mealId: string; qty: number }[] }) =>
  customFetch("/api/kitchen/orders", { method: "POST", body: JSON.stringify(input), headers: { "Content-Type": "application/json" } }) as Promise<{ orders: PlacedKitchenOrder[] }>;

export const placeKitchenSubscription = (input: DeliveryTarget & { goal: SubscriptionGoal; window: string; days: { day: string; mealId: string }[] }) =>
  customFetch("/api/kitchen/subscriptions", { method: "POST", body: JSON.stringify(input), headers: { "Content-Type": "application/json" } }) as Promise<{ id: string; discountPct: number; total: number; orders: PlacedKitchenOrder[] }>;

export const fetchKitchenSubscriptions = () =>
  customFetch("/api/kitchen/subscriptions") as Promise<{ subscriptions: KitchenSubscription[] }>;

export const cancelKitchenSubscription = (id: string) =>
  customFetch(`/api/kitchen/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" }) as Promise<{ cancelled: number; kept: number }>;

/** The server's own Arabic explanation when it refuses, otherwise a generic line. */
export function kitchenErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const m = (err.data as { message?: unknown } | null)?.message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday of a YYYY-MM-DD delivery day (a plain calendar date, no time zone involved). */
export function weekdayOf(day: string, ar = true): string {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return (ar ? WEEKDAYS_AR : WEEKDAYS_EN)[d] ?? "";
}

export function shortDate(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(d)}/${Number(m)}`;
}

/** "13-14" → "1 - 2". */
export function windowLabel(w: string | null | undefined): string {
  if (!w) return "";
  return w.split("-").map((h) => (Number(h) > 12 ? Number(h) - 12 : Number(h))).join(" - ");
}

export const money = (n: number): string => `${Math.round(n).toLocaleString("en-US")} ل.س`;

export const discounted = (price: number, pct: number): number => Math.max(0, Math.round(price * (1 - pct / 100)));

/** Time left until ordering closes, e.g. "3 س 42 د". Empty once closed. */
export function timeLeft(closesAt: string | null | undefined, now: number, ar = true): string {
  if (!closesAt) return "";
  const ms = Date.parse(closesAt) - now;
  if (!(ms > 0)) return "";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  if (h >= 24) { const d = Math.floor(h / 24); return ar ? `${d} يوم` : `${d}d`; }
  return ar ? (h > 0 ? `${h} س ${m} د` : `${m} د`) : (h > 0 ? `${h}h ${m}m` : `${m}m`);
}

/** Delivery fee per kitchen for this destination. */
export const fetchKitchenFees = (kitchenIds: string[], lat: number, lon: number) =>
  customFetch(`/api/kitchen/quote?kitchenIds=${kitchenIds.map(encodeURIComponent).join(",")}&lat=${lat}&lon=${lon}`) as Promise<{ fees: Record<string, number> }>;
