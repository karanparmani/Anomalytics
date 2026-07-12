import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WebhookVerifier } from "../WebhookVerifier.js";

describe("WebhookVerifier", () => {
  it("accepts a current WHOOP HMAC signature", () => {
    const secret = "test-secret";
    const body = Buffer.from('{"type":"sleep.updated"}');
    const timestamp = "1720800000000";
    const signature = createHmac("sha256", secret)
      .update(Buffer.concat([Buffer.from(timestamp), body]))
      .digest("base64");
    expect(new WebhookVerifier(secret).verify(body, signature, timestamp, 1720800000000)).toBe(true);
  });

  it("rejects stale events", () => {
    expect(new WebhookVerifier("secret").verify(Buffer.from("{}"), "bad", "1", 1720800000000)).toBe(false);
  });
});
