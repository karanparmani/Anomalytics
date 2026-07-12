import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TokenCipher } from "../TokenCipher.js";

describe("TokenCipher", () => {
  it("round trips a token without exposing plaintext", () => {
    const cipher = new TokenCipher(randomBytes(32).toString("base64"));
    const encrypted = cipher.encrypt("secret-refresh-token");
    expect(encrypted).not.toContain("secret-refresh-token");
    expect(cipher.decrypt(encrypted)).toBe("secret-refresh-token");
  });

  it("rejects an invalid key length", () => {
    expect(() => new TokenCipher(Buffer.from("short").toString("base64"))).toThrow(/32-byte/);
  });
});
