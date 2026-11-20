// Vendored from ZapGate's TypeScript SDK (sdk/typescript/src/index.ts, ZapGate commit 48ba7f4).
// Replace with the npm package once it is published; do not edit here.

export { ZapGate, ZapGateError } from "./client.js";
export type { ClientOptions, SendOptions } from "./client.js";
export { createWebhookHandler, parseEvent, verifySignature } from "./webhook.js";
export type { WebhookHandlerOptions } from "./webhook.js";
export type * from "./types.js";
