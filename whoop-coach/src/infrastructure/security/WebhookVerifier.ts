import { createHmac, timingSafeEqual } from "node:crypto";

export class WebhookVerifier {
  public constructor(
    private readonly secret: string,
    private readonly maximumAgeMs = 5 * 60 * 1000,
  ) {}

  public verify(rawBody: Buffer, signature: string, timestamp: string, now = Date.now()): boolean {
    const timestampMs = Number(timestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > this.maximumAgeMs) return false;
    const expected = createHmac("sha256", this.secret)
      .update(Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]))
      .digest("base64");
    const expectedBuffer = Buffer.from(expected, "utf8");
    const actualBuffer = Buffer.from(signature, "utf8");
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  }
}
