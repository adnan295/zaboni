import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { sendAdminAlert } from "./waverifyMonitor";

export interface WAAccountStatus {
  id: string;
  status: "connecting" | "qr" | "connected" | "disconnected";
  qrDataUrl?: string;
  phone?: string;
  createdAt: string;
}

interface WAAccountInternal extends WAAccountStatus {
  sock?: ReturnType<typeof makeWASocket>;
  reconnectTimer?: ReturnType<typeof setTimeout>;
}

const SESSION_BASE = path.resolve(process.cwd(), "whatsapp-session");
const ACCOUNTS_FILE = path.join(SESSION_BASE, "accounts.json");

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

class WhatsAppManager {
  private accounts = new Map<string, WAAccountInternal>();
  private sendIndex = 0;
  private allDownAlertSent = false;
  private allDownAlertInFlight = false;

  constructor() {
    ensureDir(SESSION_BASE);
    this.loadPersistedAccounts();
  }

  private loadPersistedAccounts() {
    if (!fs.existsSync(ACCOUNTS_FILE)) return;
    try {
      const ids: string[] = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
      for (const id of ids) {
        this.initSession(id, false).catch((err) =>
          console.error(`[whatsapp] Failed to restore session ${id}:`, err),
        );
      }
    } catch (err) {
      console.error("[whatsapp] Failed to load persisted accounts:", err);
    }
  }

  private persistAccounts() {
    const ids = Array.from(this.accounts.keys());
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(ids));
  }

  private async initSession(id: string, isNew: boolean) {
    const sessionPath = path.join(SESSION_BASE, id);
    ensureDir(sessionPath);

    const existing = this.accounts.get(id);
    if (existing?.reconnectTimer) clearTimeout(existing.reconnectTimer);

    const account: WAAccountInternal = {
      id,
      status: "connecting",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    this.accounts.set(id, account);

    try {
      const { version } = await fetchLatestBaileysVersion();
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["مرسول", "Chrome", "1.0.0"],
        logger: {
          level: "silent",
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          fatal: () => {},
          child: () => ({
            level: "silent",
            trace: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            fatal: () => {},
            child: () => ({}) as never,
          }),
        } as never,
      });

      account.sock = sock;

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            account.qrDataUrl = await QRCode.toDataURL(qr);
            account.status = "qr";
          } catch (err) {
            console.error(`[whatsapp] QR generation failed for ${id}:`, err);
          }
        }

        if (connection === "open") {
          account.status = "connected";
          account.qrDataUrl = undefined;
          const rawId = sock.user?.id?.split(":")[0] ?? "";
          account.phone = rawId ? `+${rawId}` : undefined;
          console.log(`[whatsapp] Account ${id} connected — phone: ${account.phone}`);
          this.allDownAlertSent = false;
          this.allDownAlertInFlight = false;
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          console.log(`[whatsapp] Account ${id} closed (code=${statusCode}, loggedOut=${loggedOut})`);

          account.sock = undefined;

          if (loggedOut) {
            account.status = "disconnected";
            fs.rmSync(sessionPath, { recursive: true, force: true });
            ensureDir(sessionPath);
          } else {
            account.status = "connecting";
            account.reconnectTimer = setTimeout(() => {
              this.initSession(id, false).catch((err) =>
                console.error(`[whatsapp] Reconnect failed for ${id}:`, err),
              );
            }, 5000);
          }

          if (!this.allDownAlertSent && !this.allDownAlertInFlight && !this.isAnyConnected()) {
            this.allDownAlertInFlight = true;
            const all = Array.from(this.accounts.values());
            const connectedCount = all.filter((a) => a.status === "connected").length;
            const disconnectedCount = all.filter((a) => a.status === "disconnected" || a.status === "connecting" || a.status === "qr").length;
            const now = new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });
            const alertMsg =
              `[مرسول] تنبيه: جميع أرقام واتساب غير متصلة\n` +
              `الأرقام المتصلة: ${connectedCount}\n` +
              `الأرقام المنقطعة: ${disconnectedCount}\n` +
              `الوقت: ${now}`;
            console.warn(`[whatsapp] All accounts offline — sending admin alert`);
            sendAdminAlert(alertMsg)
              .then((delivered) => {
                if (delivered) this.allDownAlertSent = true;
              })
              .catch((err) => console.error("[whatsapp] Failed to send all-down alert:", err))
              .finally(() => { this.allDownAlertInFlight = false; });
          }
        }
      });
    } catch (err) {
      console.error(`[whatsapp] initSession error for ${id}:`, err);
      account.status = "disconnected";
    }
  }

  async addAccount(): Promise<string> {
    const id = `wa_${Date.now()}`;
    await this.initSession(id, true);
    this.persistAccounts();
    return id;
  }

  async disconnect(id: string): Promise<void> {
    const account = this.accounts.get(id);
    if (!account) return;

    if (account.reconnectTimer) clearTimeout(account.reconnectTimer);

    if (account.sock) {
      try {
        await account.sock.logout();
      } catch {}
      try {
        account.sock.end(undefined);
      } catch {}
    }

    const sessionPath = path.join(SESSION_BASE, id);
    fs.rmSync(sessionPath, { recursive: true, force: true });
    this.accounts.delete(id);
    this.persistAccounts();
  }

  getStatus(): WAAccountStatus[] {
    return Array.from(this.accounts.values()).map(
      ({ sock: _sock, reconnectTimer: _t, ...rest }) => rest,
    );
  }

  isAnyConnected(): boolean {
    return Array.from(this.accounts.values()).some((a) => a.status === "connected");
  }

  async sendMessage(phone: string, text: string): Promise<boolean> {
    const connected = Array.from(this.accounts.values()).filter(
      (a) => a.status === "connected" && a.sock,
    );
    if (connected.length === 0) return false;

    const jid = phone.replace("+", "") + "@s.whatsapp.net";

    const startIdx = this.sendIndex % connected.length;
    this.sendIndex++;

    const ordered = [
      ...connected.slice(startIdx),
      ...connected.slice(0, startIdx),
    ];

    for (const account of ordered) {
      try {
        await account.sock!.sendMessage(jid, { text });
        console.log(`[whatsapp] Sent OTP to ${phone} via account ${account.id}`);
        return true;
      } catch (err) {
        console.warn(`[whatsapp] Send failed via ${account.id}:`, (err as Error).message);
      }
    }

    return false;
  }
}

export const whatsappManager = new WhatsAppManager();
