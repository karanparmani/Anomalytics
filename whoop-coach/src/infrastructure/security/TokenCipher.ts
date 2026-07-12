import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

export class TokenCipher {
  readonly #key: Buffer;

  public constructor(base64Key: string) {
    this.#key = Buffer.from(base64Key, "base64");
    if (this.#key.length !== 32) {
      throw new Error("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    }
  }

  public encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  public decrypt(envelope: string): string {
    const [version, ivValue, tagValue, ciphertextValue] = envelope.split(".");
    if (version !== VERSION || ivValue === undefined || tagValue === undefined || ciphertextValue === undefined) {
      throw new Error("Unsupported encrypted token envelope.");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}
