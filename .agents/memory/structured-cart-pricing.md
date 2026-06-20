---
name: Structured cart server-authoritative pricing
description: How order pricing/restaurant scoping must stay server-computed in POST /api/orders
---

# Structured cart pricing & restaurant scoping

`POST /api/orders` must NEVER trust client-supplied prices or restaurant ids when `items[]` is present.

**Rules:**
- Unit prices, line totals, and the order subtotal (`itemsTotal`) are recomputed from `menu_items` rows in the DB. Any client `totalPrice` is ignored (the field was removed from the create schema).
- The order's restaurant is derived from the cart items themselves (`itemsRestaurantId` = restaurant of the first item). A single-restaurant invariant is enforced server-side: any item from a different restaurant → 400 `items_cross_restaurant`, independent of the client-sent `restaurantId`.
- `effectiveRestaurantId = itemsRestaurantId ?? body.data.restaurantId` drives restaurant lookup, flash-deal lookup, promo scoping, stored `restaurantId`, and the new-order notification.
- Flash-deal discount base uses `itemsTotal ?? zoneFee` (never a client price).

**Why:** Task goal was a Yemeksepeti-style structured cart where prices are 100% server-computed; trusting client `totalPrice` or `restaurantId` was a price-tampering / cross-restaurant-cart vulnerability flagged in code review.

**How to apply:** When adding priced add-ons/options or any new order field that affects price, compute it server-side from DB and fold it into `itemsTotal`; do not accept a client-provided amount.
