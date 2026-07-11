/**
 * MaskedString utility wraps sensitive PII data (e.g. emails, names, phone numbers)
 * to prevent accidental leakage in log outputs.
 */
export class MaskedString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Returns a partially masked string.
   * E.g., "John Doe" -> "J******e"
   * E.g., "john.doe@bank.com" -> "j*******e@bank.com"
   */
  public getMaskedValue(): string {
    if (!this.value) return "";
    
    // Check if it's an email
    if (this.value.includes("@")) {
      const [local, domain] = this.value.split("@");
      if (!local || !domain) return "[MASKED EMAIL]";
      const maskedLocal = local[0] + "*".repeat(Math.max(1, local.length - 2)) + (local.length > 1 ? local[local.length - 1] : "");
      return `${maskedLocal}@${domain}`;
    }

    // Standard text (e.g. name or ID)
    if (this.value.length <= 2) {
      return "*".repeat(this.value.length);
    }
    return this.value[0] + "*".repeat(this.value.length - 2) + this.value[this.value.length - 1];
  }

  /**
   * Overrides toString to prevent accidental plain-text logging.
   */
  public toString(): string {
    return this.getMaskedValue();
  }

  /**
   * Overrides toJSON for JSON.stringify compliance.
   */
  public toJSON(): string {
    return this.getMaskedValue();
  }

  /**
   * Explicit getter for internal business logic when safe.
   */
  public getUnsafeValue(): string {
    return this.value;
  }
}
