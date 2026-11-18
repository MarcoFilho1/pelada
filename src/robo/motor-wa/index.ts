// Vendored from motor-wa's TypeScript SDK (sdk/typescript/src/index.ts, motor-wa commit 6742498).
// Replace with the npm package once it is published; do not edit here.

export { MotorWa, MotorWaError } from "./client.js";
export type { ClientOptions, SendOptions } from "./client.js";
export { createWebhookHandler, parseEvent, verifySignature } from "./webhook.js";
export type { WebhookHandlerOptions } from "./webhook.js";
export type * from "./types.js";
