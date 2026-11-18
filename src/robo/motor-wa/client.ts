// Vendored from motor-wa's TypeScript SDK (sdk/typescript/src/client.ts, motor-wa commit 6742498).
// Replace with the npm package once it is published; do not edit here.

import type { Address, ErrorBody, Group, SendResult, SessionStatus } from "./types.js";

/**
 * A request motor-wa did not fulfil. `code` is stable: gate refusals (`not_a_reply`,
 * `offline_message`, `opted_out`, `hourly_limit`, ...) mean **nothing reached WhatsApp**.
 */
export class MotorWaError extends Error {
  /** HTTP status. */
  readonly status: number;
  /** Stable machine-readable code. */
  readonly code: string;
  /** For time-based refusals: seconds until a retry could pass. */
  readonly retryAfter?: number;
  /** motor-wa's reference, when the message was accepted and failed later. */
  readonly ref?: string;

  constructor(status: number, body: ErrorBody & { ref?: string }) {
    super(`${body.code}: ${body.detail}`);
    this.name = "MotorWaError";
    this.status = status;
    this.code = body.code;
    this.retryAfter = body.retry_after_s;
    this.ref = body.ref;
  }

  /** The gate refused it: nothing was sent, and retrying the same thing will be refused again unless the situation changes. */
  get refusedByGate(): boolean {
    return this.status === 409;
  }

  /**
   * Worth retrying later: not connected, no confirmation (503), or motor-wa could not be reached
   * / did not answer in time (`network`, `timeout`; status 0). After `no_ack` or `timeout` the
   * message may have been sent: retry only with the same `clientRef`.
   */
  get temporary(): boolean {
    return this.status === 503 || this.status === 0;
  }
}

export interface ClientOptions {
  /** e.g. `http://127.0.0.1:8787` */
  baseUrl: string;
  /** API key (Bearer). */
  apiKey: string;
  /** Session id from the motor-wa config. */
  session: string;
  /** Per-request timeout in ms (default 70 000, above the default 60 s ack wait). */
  timeoutMs?: number;
  /** Custom fetch (tests, proxies). */
  fetch?: typeof fetch;
}

export interface SendOptions {
  /** Idempotency key: the same key (per API key) never sends twice. Strongly recommended. */
  clientRef?: string;
  /** Quote this message id. Also lets the gate block a second answer to the same message. */
  replyTo?: string;
  /** `"ack"` (default): resolve after WhatsApp's server confirmed. `"queued"`: resolve once accepted. */
  wait?: "ack" | "queued";
  /** With `wait: "ack"`, give up waiting after this many seconds (1-300, default 60). */
  timeoutS?: number;
}

/**
 * Client for one motor-wa session.
 *
 * ```ts
 * const wa = new MotorWa({ baseUrl: "http://127.0.0.1:8787", apiKey: process.env.MOTOR_WA_KEY!, session: "mybot" });
 * await wa.sendText("5583999990000", "oi!", { replyTo: msg.id, clientRef: `reply-${msg.id}` });
 * ```
 */
export class MotorWa {
  private readonly base: string;
  private readonly key: string;
  private readonly session: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions) {
    this.base = options.baseUrl.replace(/\/+$/, "");
    this.key = options.apiKey;
    this.session = encodeURIComponent(options.session);
    this.timeoutMs = options.timeoutMs ?? 70_000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async request<T>(method: string, path: string, body?: unknown, timeoutMs = this.timeoutMs): Promise<{ status: number; data: T }> {
    let res: Response;
    let text: string;
    try {
      res = await this.fetchImpl(this.base + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await res.text();
    } catch (err) {
      const timeout = (err as Error)?.name === "TimeoutError" || (err as Error)?.name === "AbortError";
      throw new MotorWaError(0, {
        code: timeout ? "timeout" : "network",
        detail: timeout ? `no answer from motor-wa in ${timeoutMs} ms` : `cannot reach motor-wa: ${(err as Error)?.message}`,
      });
    }
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined; // plain-text error from the server or a proxy
    }
    if (!res.ok) {
      const envelope = data as { error?: ErrorBody; ref?: string } | undefined;
      const err = envelope?.error ?? { code: "http_error", detail: text ? text.slice(0, 200) : `HTTP ${res.status}` };
      throw new MotorWaError(res.status, { ...err, ref: envelope?.ref });
    }
    if (text && data === undefined) {
      throw new MotorWaError(res.status, { code: "bad_response", detail: `expected JSON, got: ${text.slice(0, 200)}` });
    }
    return { status: res.status, data: data as T };
  }

  private send(to: Address, content: unknown, options: SendOptions = {}): Promise<SendResult> {
    const q = new URLSearchParams();
    if (options.wait) q.set("wait", options.wait);
    if (options.timeoutS) q.set("timeout_s", String(options.timeoutS));
    const qs = q.toString() ? `?${q}` : ""; // (URLSearchParams.size needs Node 19.8+)
    // Never give up before the server does (it may still confirm the send).
    const serverWaitMs = (options.wait === "queued" ? 0 : (options.timeoutS ?? 60) * 1000) + 10_000;
    return this.request<SendResult>(
      "POST",
      `/v1/sessions/${this.session}/messages${qs}`,
      { to, content, reply_to: options.replyTo, client_ref: options.clientRef },
      Math.max(this.timeoutMs, serverWaitMs),
    ).then((r) => r.data);
  }

  /**
   * Sends text. Resolves with `status: "acked"` once WhatsApp confirmed (or `"queued"` with
   * `wait: "queued"` / after the wait timed out). Rejects with {@link MotorWaError} otherwise.
   */
  sendText(to: Address, text: string, options?: SendOptions): Promise<SendResult> {
    return this.send(to, { type: "text", body: text }, options);
  }

  /** Reacts to a message with an emoji (empty string removes the reaction). */
  react(to: Address, messageId: string, emoji: string, options?: SendOptions): Promise<SendResult> {
    return this.send(to, { type: "reaction", to_message: messageId, emoji }, options);
  }

  /** Status of a message sent through the API. */
  async message(ref: string): Promise<SendResult> {
    return (await this.request<SendResult>("GET", `/v1/sessions/${this.session}/messages/${encodeURIComponent(ref)}`)).data;
  }

  /** The session's status. */
  async status(): Promise<SessionStatus> {
    return (await this.request<SessionStatus>("GET", `/v1/sessions/${this.session}`)).data;
  }

  /** Groups this account is in, optionally filtered by name (case-insensitive substring). */
  async groups(name?: string): Promise<Group[]> {
    const qs = name ? `?name=${encodeURIComponent(name)}` : "";
    return (await this.request<Group[]>("GET", `/v1/sessions/${this.session}/groups${qs}`)).data;
  }

  /** Whether a phone number has WhatsApp (rate-limited by the gate). */
  async lookup(phone: string): Promise<{ exists: boolean; address?: Address }> {
    return (await this.request<{ exists: boolean; address?: Address }>("GET", `/v1/sessions/${this.session}/contacts/${encodeURIComponent(phone)}`)).data;
  }

  /** Admin: requests a pairing code for the session's expected number. */
  async pairWithCode(): Promise<string> {
    return (await this.request<{ code: string }>("POST", `/v1/sessions/${this.session}/pairing`, { method: "code" })).data.code;
  }

  /** Admin: enables or disables sending. */
  async setSending(enabled: boolean): Promise<SessionStatus> {
    return (await this.request<SessionStatus>("PUT", `/v1/sessions/${this.session}/sending`, { enabled })).data;
  }

  /** Admin: switches cautious mode on or off. */
  async setCautious(enabled: boolean): Promise<SessionStatus> {
    return (await this.request<SessionStatus>("PUT", `/v1/sessions/${this.session}/cautious`, { enabled })).data;
  }
}
