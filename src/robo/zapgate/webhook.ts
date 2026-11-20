// Vendored from ZapGate's TypeScript SDK (sdk/typescript/src/webhook.ts, ZapGate commit 48ba7f4).
// Replace with the npm package once it is published; do not edit here.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { WebhookEvent } from "./types.js";

/**
 * Checks `X-ZapGate-Signature` (`t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`).
 * Rejects signatures older than `toleranceSec` (default 300) to prevent replays.
 * Pass the **raw** body, exactly as received (not re-serialized JSON).
 */
export function verifySignature(
  secret: string,
  header: string | undefined | null,
  rawBody: string | Buffer,
  options: { toleranceSec?: number; now?: number } = {},
): boolean {
  if (!header) return false;
  const parts = new Map(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
    }),
  );
  const t = Number(parts.get("t"));
  const v1 = parts.get("v1");
  if (!Number.isFinite(t) || !v1) return false;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (options.toleranceSec ?? 300)) return false;
  const expected = createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Verifies and parses an event. Throws if the signature is invalid. */
export function parseEvent(secret: string, header: string | undefined | null, rawBody: string | Buffer): WebhookEvent {
  if (!verifySignature(secret, header, rawBody)) {
    throw new Error("invalid zapgate webhook signature");
  }
  return JSON.parse(rawBody.toString()) as WebhookEvent;
}

/** Requests above this size are refused without being read further. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export interface WebhookHandlerOptions {
  secret: string;
  /**
   * Called once per verified event. Deduplicate with `event.id` (delivery is at least once).
   * **Return quickly** (well under zapgate's 15 s delivery timeout): do slow work, like sending
   * a reply with `wait: "ack"`, in the background. While this runs, later events wait.
   */
  onEvent: (event: WebhookEvent) => void | Promise<void>;
  /** Called when a request fails verification or handling (default: console.error). */
  onError?: (err: unknown) => void;
}

/**
 * A Node `http` request handler (also works as Express middleware on a route that has **not**
 * parsed the body). Answers 200 after `onEvent` resolves, 401 on a bad signature (zapgate then
 * retries: a wrong secret loses nothing), 422 on an unparsable body and 500 if `onEvent` throws
 * (zapgate retries those too).
 */
export function createWebhookHandler(options: WebhookHandlerOptions) {
  const onError = options.onError ?? ((err: unknown) => console.error("zapgate webhook:", err));
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.readableEnded || (req as { body?: unknown }).body !== undefined) {
      // A body parser (e.g. express.json()) already consumed the raw body: the signature cannot
      // be checked. Mount the handler before any body parser.
      onError(new Error("the request body was already parsed; mount createWebhookHandler before body parsers"));
      res.writeHead(500).end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let refused = false;
    req.on("error", (err) => onError(err));
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES && !refused) {
        refused = true;
        res.writeHead(413).end();
        req.destroy();
        return;
      }
      if (!refused) chunks.push(c);
    });
    req.on("end", () => {
      if (refused) return;
      const raw = Buffer.concat(chunks);
      const sig = req.headers["x-zapgate-signature"];
      if (!verifySignature(options.secret, Array.isArray(sig) ? sig[0] : sig, raw)) {
        onError(new Error("invalid signature"));
        res.writeHead(401).end();
        return;
      }
      let event: WebhookEvent;
      try {
        event = JSON.parse(raw.toString()) as WebhookEvent;
      } catch (err) {
        onError(err);
        res.writeHead(422).end();
        return;
      }
      Promise.resolve()
        .then(() => options.onEvent(event))
        .then(
          () => res.writeHead(200).end(),
          (err) => {
            onError(err);
            res.writeHead(500).end();
          },
        );
    });
  };
}
