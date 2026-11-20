// Vendored from ZapGate's TypeScript SDK (sdk/typescript/src/client.ts, ZapGate commit 48ba7f4).
// Replace with the npm package once it is published; do not edit here.

import type { Address, ErrorBody, Group, MediaKind, SendResult, SessionStatus } from "./types.js";

/**
 * A request zapgate did not fulfil. `code` is stable: gate refusals (`not_a_reply`,
 * `offline_message`, `opted_out`, `hourly_limit`, ...) mean **nothing reached WhatsApp**.
 */
export class ZapGateError extends Error {
  /** HTTP status. */
  readonly status: number;
  /** Stable machine-readable code. */
  readonly code: string;
  /** For time-based refusals: seconds until a retry could pass. */
  readonly retryAfter?: number;
  /** zapgate's reference, when the message was accepted and failed later. */
  readonly ref?: string;

  constructor(status: number, body: ErrorBody & { ref?: string }) {
    super(`${body.code}: ${body.detail}`);
    this.name = "ZapGateError";
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
   * Worth retrying later: not connected, no confirmation (503), or zapgate could not be reached
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
  /** Session id from the zapgate config. */
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
  /**
   * `"auto"` (default): typed like a conversation, long answers split into several messages.
   * `"whole"`: one message with a short "typing…", like pasted text (lists, announcements).
   */
  style?: "auto" | "whole";
}

/**
 * Client for one zapgate session.
 *
 * ```ts
 * const wa = new ZapGate({ baseUrl: "http://127.0.0.1:8787", apiKey: process.env.ZAPGATE_KEY!, session: "mybot" });
 * await wa.sendText("5583999990000", "oi!", { replyTo: msg.id, clientRef: `reply-${msg.id}` });
 * ```
 */
export class ZapGate {
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
      throw new ZapGateError(0, {
        code: timeout ? "timeout" : "network",
        detail: timeout ? `no answer from zapgate in ${timeoutMs} ms` : `cannot reach zapgate: ${(err as Error)?.message}`,
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
      throw new ZapGateError(res.status, { ...err, ref: envelope?.ref });
    }
    if (text && data === undefined) {
      throw new ZapGateError(res.status, { code: "bad_response", detail: `expected JSON, got: ${text.slice(0, 200)}` });
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
      { to, content, reply_to: options.replyTo, client_ref: options.clientRef, style: options.style },
      Math.max(this.timeoutMs, serverWaitMs),
    ).then((r) => r.data);
  }

  /**
   * Sends text. Resolves with `status: "acked"` once WhatsApp confirmed (or `"queued"` with
   * `wait: "queued"` / after the wait timed out). Rejects with {@link ZapGateError} otherwise.
   */
  sendText(to: Address, text: string, options?: SendOptions): Promise<SendResult> {
    return this.send(to, { type: "text", body: text }, options);
  }

  /**
   * Uploads a file to send later (kept 24 h). Streams on the server side; limit 64 MB.
   * Returns the `mediaId` to pass to {@link sendMedia}.
   */
  async uploadMedia(data: Blob | Uint8Array, options: { fileName?: string; mime?: string } = {}): Promise<{ mediaId: string; size: number; mime: string }> {
    const type = options.mime ?? (data instanceof Blob && data.type ? data.type : "application/octet-stream");
    const blob = data instanceof Blob && (!options.mime || data.type === options.mime) ? data : new Blob([data as unknown as BlobPart], { type });
    const form = new FormData();
    form.append("file", blob, options.fileName ?? "file");
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/v1/sessions/${this.session}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}` },
        body: form,
        signal: AbortSignal.timeout(Math.max(this.timeoutMs, 300_000)),
      });
    } catch (err) {
      const timeout = (err as Error)?.name === "TimeoutError" || (err as Error)?.name === "AbortError";
      throw new ZapGateError(0, { code: timeout ? "timeout" : "network", detail: `upload: ${(err as Error)?.message}` });
    }
    const text = await res.text();
    let data2: { media_id?: string; size?: number; mime?: string; error?: ErrorBody } | undefined;
    try {
      data2 = text ? JSON.parse(text) : undefined;
    } catch {
      data2 = undefined;
    }
    if (!res.ok || !data2?.media_id) {
      throw new ZapGateError(res.status, data2?.error ?? { code: "http_error", detail: text.slice(0, 200) || `HTTP ${res.status}` });
    }
    return { mediaId: data2.media_id, size: data2.size ?? 0, mime: data2.mime ?? "application/octet-stream" };
  }

  /** Sends a file uploaded with {@link uploadMedia}. */
  sendMedia(
    to: Address,
    media: { kind: MediaKind; mediaId: string; caption?: string; fileName?: string; voiceNote?: boolean },
    options?: SendOptions,
  ): Promise<SendResult> {
    return this.send(
      to,
      { type: "media", kind: media.kind, media_id: media.mediaId, caption: media.caption, file_name: media.fileName, voice_note: media.voiceNote ?? false },
      options,
    );
  }

  /**
   * Fetches the media of a received message (`event.data.media.media_id`). zapgate downloads
   * it from WhatsApp on first request. Returns the raw `Response` so large files can be streamed.
   */
  async downloadMedia(mediaId: string): Promise<Response> {
    // The timeout covers waiting for the response (zapgate may be fetching from WhatsApp), not
    // reading the body: a large file may take longer to stream.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(this.timeoutMs, 300_000));
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/v1/sessions/${this.session}/media/${encodeURIComponent(mediaId)}`, {
        headers: { Authorization: `Bearer ${this.key}` },
        signal: controller.signal,
      });
    } catch (err) {
      const timeout = (err as Error)?.name === "AbortError" || (err as Error)?.name === "TimeoutError";
      throw new ZapGateError(0, { code: timeout ? "timeout" : "network", detail: `download: ${(err as Error)?.message}` });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const text = await res.text();
      let err: ErrorBody | undefined;
      try {
        err = JSON.parse(text).error;
      } catch {
        err = undefined;
      }
      throw new ZapGateError(res.status, err ?? { code: "http_error", detail: text.slice(0, 200) || `HTTP ${res.status}` });
    }
    return res;
  }

  /**
   * Reacts to a message with an emoji (empty string removes the reaction). Only to a recent
   * message this account received in that chat; reactions have their own hourly limit.
   */
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
