// Searching orders are deliberately never cancelled on a timer. A notification
// provider accepting a message is not evidence that a courier saw the order.
// orderDispatch.ts retries persistently; /admin/sla-alerts escalates pending work.
// Only explicit customer/admin actions may cancel an unaccepted order.
export function startOrderExpiryJob(): void {
  // Kept as a no-op for compatibility with older startup wiring.
}
