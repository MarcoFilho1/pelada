// Vendored from motor-wa's TypeScript SDK (sdk/typescript/src/types.ts, motor-wa commit 6742498).
// Replace with the npm package once it is published; do not edit here.

// Types mirroring api/openapi.yaml (v1). Kept by hand for now; the contract is the source of truth.

/** `<digits>@s.whatsapp.net`, `<digits>@lid` or `<id>@g.us`. Requests also accept bare phone digits. */
export type Address = string;

export type SessionState =
  | "unpaired"
  | "pairing"
  | "connecting"
  | "connected"
  | "disconnected"
  | "wrong_number"
  | "logged_out"
  | "replaced"
  | "banned"
  | "failed";

export type Sending = "receive_only" | "enabled" | "cautious";

export interface SessionStatus {
  id: string;
  state: SessionState;
  expected_number: string;
  own_address?: Address;
  /** This account's privacy id; mentions in groups often use it. */
  own_lid?: Address;
  sending: Sending;
  queue_length: number;
  warmup_factor: number;
  connected_since?: string;
  state_detail?: string;
  webhook_backlog?: number;
}

export type MessageStatus = "queued" | "sending" | "acked" | "delivered" | "read" | "failed";

export interface ErrorBody {
  code: string;
  detail: string;
  retry_after_s?: number;
}

export interface SendResult {
  ref: string;
  status: MessageStatus;
  id?: string;
  to?: Address;
  error?: ErrorBody;
}

export interface Group {
  address: Address;
  name: string;
  participants?: number | null;
}

export type MediaKind = "image" | "audio" | "document" | "video" | "sticker";

export interface MessageReceived {
  id: string;
  chat: Address;
  sender: Address;
  sender_alt?: Address;
  push_name?: string;
  is_group: boolean;
  /** Unix seconds. */
  timestamp: number;
  text?: string;
  media?: { media_id?: string; kind: MediaKind; mime?: string | null; size?: number | null; file_name?: string | null };
  mentions: Address[];
  /** One of the mentions is this account (by phone or LID). */
  mentions_me: boolean;
  reply_to?: string;
  /** Who wrote the quoted message. */
  reply_to_sender?: Address;
  /** The quoted message was written by this account. */
  replies_to_me?: boolean;
  /** Arrived late (catch-up sync, replay): the gate will not let you answer it automatically. */
  offline: boolean;
}

export interface MessageStatusEvent {
  ref: string;
  id?: string;
  status: Exclude<MessageStatus, "queued" | "sending">;
  error?: ErrorBody;
}

export interface SessionStateEvent {
  state: SessionState;
  reason?: string | null;
}

export interface PairingEvent {
  method: "code" | "qr";
  code?: string;
  qr?: string;
  expires_in_s: number;
}

export interface RiskEvent {
  level: "cautious" | "normal" | "banned";
  signal: string;
  ban_reason?: string;
  ban_expires_in_s?: number;
}

interface EventBase<T extends string, D> {
  id: string;
  type: T;
  session: string;
  /** RFC 3339. */
  at: string;
  data: D;
}

export type WebhookEvent =
  | EventBase<"message.received", MessageReceived>
  | EventBase<"message.status", MessageStatusEvent>
  | EventBase<"session.state", SessionStateEvent>
  | EventBase<"session.pairing", PairingEvent>
  | EventBase<"session.risk", RiskEvent>;
