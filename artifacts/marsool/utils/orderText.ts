/**
 * Adds a menu item to a free-text order. Tapping the same item again bumps its
 * count ("شاورما دجاج × 2") instead of writing it twice; whatever the customer
 * typed by hand is kept as it is.
 */
export function addItemToOrderText(text: string, item: string): string {
  const name = item.trim();
  if (!name) return text;
  const lines = text.split("\n");
  const pattern = new RegExp(`^${escapeRegExp(name)}(?:\\s*[×x]\\s*(\\d+))?\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(pattern);
    if (m) {
      const qty = (m[1] ? Number(m[1]) : 1) + 1;
      lines[i] = `${name} × ${qty}`;
      return lines.join("\n");
    }
  }
  const trimmed = text.replace(/\s+$/, "");
  return trimmed ? `${trimmed}\n${name}` : name;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
