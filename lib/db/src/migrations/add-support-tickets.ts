import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addSupportTickets(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id text REFERENCES orders(id) ON DELETE SET NULL,
      category text NOT NULL DEFAULT 'other',
      status text NOT NULL DEFAULT 'open',
      created_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id
    ON support_tickets (user_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_support_tickets_status
    ON support_tickets (status)
  `);

  await db.execute(sql`
    ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS
    ticket_id text REFERENCES support_tickets(id) ON DELETE CASCADE
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id
    ON support_messages (ticket_id)
    WHERE ticket_id IS NOT NULL
  `);

  console.log("[migration] support_tickets table ensured.");
}
