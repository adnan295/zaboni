// Real client IP behind Cloudflare → host nginx → container nginx → api-server.
//
// Every hop appends to X-Forwarded-For, but the left part of that header is
// whatever the client sent, so taking the first entry lets anyone pick their
// own IP (and with it, a fresh rate-limit bucket). Instead, walk the chain from
// the right and skip only hops we know are ours: private/loopback addresses
// (docker networks, the host nginx) and Cloudflare's published edge ranges.
// The first address that is neither is the client. If the request reached the
// origin directly (bypassing Cloudflare), the same walk still stops at the real
// peer, because a spoofed entry can only sit to the left of it.

import { BlockList, isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";

const CLOUDFLARE_V4 = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];
const CLOUDFLARE_V6 = [
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
  "2a06:98c0::/29", "2c0f:f248::/32",
];
const PRIVATE_V4 = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16", "100.64.0.0/10"];
const PRIVATE_V6 = ["::1/128", "fc00::/7", "fe80::/10"];

function blockList(v4: string[], v6: string[]): BlockList {
  const list = new BlockList();
  for (const c of v4) { const [net, bits] = c.split("/"); list.addSubnet(net!, Number(bits), "ipv4"); }
  for (const c of v6) { const [net, bits] = c.split("/"); list.addSubnet(net!, Number(bits), "ipv6"); }
  return list;
}

const cloudflare = blockList(CLOUDFLARE_V4, CLOUDFLARE_V6);
const internal = blockList(PRIVATE_V4, PRIVATE_V6);

/** Strips "::ffff:" from IPv4-mapped IPv6 addresses so v4 ranges match them. */
export function normalizeIp(raw: string | undefined | null): string {
  const ip = (raw ?? "").trim().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return mapped ? mapped[1]! : ip;
}

function family(ip: string): "ipv4" | "ipv6" | null {
  const v = isIP(ip);
  return v === 4 ? "ipv4" : v === 6 ? "ipv6" : null;
}

export function isCloudflareIp(raw: string): boolean {
  const ip = normalizeIp(raw);
  const f = family(ip);
  return f != null && cloudflare.check(ip, f);
}

/** A hop we operate or that relays for us (never a real client). */
export function isTrustedProxy(raw: string): boolean {
  const ip = normalizeIp(raw);
  const f = family(ip);
  return f != null && (internal.check(ip, f) || cloudflare.check(ip, f));
}

/**
 * The real client address from the socket peer plus X-Forwarded-For /
 * CF-Connecting-IP. Works for Express requests and Socket.IO handshakes.
 */
export function clientIpFrom(headers: IncomingHttpHeaders, peer: string | undefined | null): string {
  const xff = headers["x-forwarded-for"];
  const chain = (Array.isArray(xff) ? xff.join(",") : xff ?? "")
    .split(",")
    .map((s) => normalizeIp(s))
    .filter(Boolean);
  const hops = [...chain, normalizeIp(peer)].filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i]!;
    if (!family(hop)) continue;
    if (isTrustedProxy(hop)) {
      // Cloudflare is the last relay: it sets CF-Connecting-IP itself (clients
      // can't override it through Cloudflare), so it is the client.
      if (isCloudflareIp(hop)) {
        const cf = normalizeIp(headers["cf-connecting-ip"] as string | undefined);
        if (family(cf)) return cf;
      }
      continue;
    }
    return hop;
  }
  return hops[0] ?? "unknown";
}

/**
 * For app.set("trust proxy", …): Express then skips these hops from the right,
 * so req.ip is the first untrusted address (the client).
 */
export function trustProxy(addr: string): boolean {
  return isTrustedProxy(addr);
}

/** The real client IP of an Express request. Use this instead of req.ip. */
export function clientIp(req: { headers: IncomingHttpHeaders; socket?: { remoteAddress?: string | undefined } }): string {
  return clientIpFrom(req.headers, req.socket?.remoteAddress);
}
