---
name: Marsool RTL bottom tab bar order
description: Why the bottom tab order keeps getting "reversed" across sessions and why flipping it again is the wrong move.
---

# Marsool bottom tab bar RTL order — STOP flip-flopping it

The bottom tab order in `artifacts/marsool/app/(tabs)/_layout.tsx` has been reversed
3+ times across sessions (commits keep alternating the declaration order). Each session a
user reports "الشريط معكوس / home is on the wrong side", an agent flips the JSX order, and
the next session it gets reported again. **Flipping the declaration order again is the
repeatedly-failed approach — do not do it without on-device proof.**

## The canonical order (keep this)
Declaration order in BOTH `NativeTabLayout` and `ClassicTabLayout`:
`index(home) → favorites → orders → profile`.

**Why:** React Navigation bottom tabs respect `I18nManager.isRTL` and auto-reverse the tab
row in RTL. The app forces RTL (`forceRTL(true)` in `context/LanguageContext.tsx`), so with
isRTL=true this order renders visually as `حسابي(left) | طلباتي | مفضلة | الرئيسية(right)`,
i.e. home on the RIGHT — correct for Arabic. This was the deliberate Task #243 fix.

## The REAL root cause of the recurring complaint
The user tests on a **production build on a physical device**. The complaint persists not
because the order is wrong, but because **the JS/OTA update never reaches the device**:
- Replit "Publish/Deploy" only deploys web/API — it does NOT push the mobile OTA bundle.
- Mobile updates require `cd artifacts/marsool && eas update --channel production`, and the
  device must relaunch (often twice) to fetch+apply.
- Separately, `forceRTL(true)` only takes full native effect after an app **restart**; on a
  fresh launch isRTL can still be false, making the tab bar render LTR (home on left) until
  relaunch.

**How to apply:** When asked to "fix the reversed tab bar", do NOT just flip the order.
First confirm whether the latest bundle is actually on the device (eas update ran + app
relaunched) and whether isRTL is true at runtime. Only adjust order with on-device evidence.
