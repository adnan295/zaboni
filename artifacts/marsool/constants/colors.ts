// زبوني identity (تشرين التاني 2026): white and clean, red only where it matters.
// Six colours: brand red, light red, ink, dark grey, green, and one offer colour.
// Use these tokens (via useColors) instead of hex codes in screens.
const colors = {
  light: {
    text: "#111827",
    tint: "#DC2626",

    background: "#F6F6F7",
    foreground: "#111827",

    card: "#FFFFFF",
    cardForeground: "#111827",

    // Buttons, prices, the selected thing.
    primary: "#DC2626",
    primaryForeground: "#FFFFFF",
    // Red text on light backgrounds (passes contrast where #DC2626 is borderline).
    primaryDark: "#B91C1C",

    // Light red: soft backgrounds, the selected tab's pill, info strips.
    secondary: "#FEF2F2",
    secondaryForeground: "#B91C1C",

    muted: "#F3F4F6",
    // Secondary text must stay readable in sunlight: dark grey, not washed out.
    mutedForeground: "#4B5563",

    accent: "#FEE2E2",
    accentForeground: "#B91C1C",

    destructive: "#DC2626",
    destructiveForeground: "#FFFFFF",

    border: "#E5E7EB",
    input: "#E5E7EB",

    success: "#15803D",
    successForeground: "#FFFFFF",

    // The one offer colour: discounts and limited deals only.
    offer: "#FEF3C7",
    offerForeground: "#92400E",

    warning: "#B45309",
    warningForeground: "#FFFFFF",
  },

  radius: 12,
};

/** Type scale (Tajawal): screen title, section, card title, body, meta. */
export const type = {
  title: 26,
  section: 18,
  cardTitle: 16,
  body: 15,
  meta: 13,
} as const;

/** One soft shadow for every card. */
export const cardShadow = {
  shadowColor: "#111827",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
} as const;

export default colors;
