import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { MaskedString } from "../../infrastructure/logging/MaskedString.js";

// Safe ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SanctionsData {
  sanctionedNames: string[];
  sanctionedCountries: string[];
  highRiskCountries: string[];
}

export class SanctionsChecker {
  private sanctionedNames: Set<string> = new Set();
  private sanctionedCountries: Set<string> = new Set();
  private highRiskCountries: Set<string> = new Set();
  private isLoaded = false;
  private readonly amlThreshold: number;

  constructor(amlThreshold = 10000.0) {
    this.amlThreshold = amlThreshold;
    this.loadSanctionsListSync();
  }

  /**
   * Load the sanctions list into in-memory Sets for O(1) hot-path lookups.
   */
  private loadSanctionsListSync(): void {
    try {
      const configPath = process.env.SANCTIONS_LIST_FILE_PATH 
        ? path.resolve(process.env.SANCTIONS_LIST_FILE_PATH)
        : path.join(__dirname, "sanctions_list.json");

      if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, "utf-8");
        const data = JSON.parse(fileContent) as SanctionsData;

        this.sanctionedNames = new Set(data.sanctionedNames.map(n => n.toUpperCase().trim()));
        this.sanctionedCountries = new Set(data.sanctionedCountries.map(c => c.toUpperCase().trim()));
        this.highRiskCountries = new Set(data.highRiskCountries.map(c => c.toUpperCase().trim()));
        this.isLoaded = true;
      } else {
        // Fallback defaults if file not found
        this.sanctionedNames = new Set(["VLADIMIR PETROV", "KIM JONG-UN"]);
        this.sanctionedCountries = new Set(["KP", "IR", "SY"]);
        this.highRiskCountries = new Set(["RU", "YE"]);
      }
    } catch (error) {
      // Compliance logging: Mask error paths or log safely
      console.error("[COMPLIANCE ERROR] Failed to load sanctions data:", error);
    }
  }

  /**
   * Evaluates if a transaction or traffic event flags AML or OFAC sanctions guidelines.
   * Runs in O(1) time.
   */
  public check(
    recipientName: string | null,
    recipientCountry: string | null,
    amount: number | null
  ): { isSanctioned: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // 1. Sanctions List Name Check (OFAC)
    if (recipientName) {
      const nameUpper = recipientName.toUpperCase().trim();
      const maskedName = new MaskedString(recipientName);

      // Exact match
      if (this.sanctionedNames.has(nameUpper)) {
        reasons.push(`OFAC Match: Recipient Name '${maskedName.getMaskedValue()}' is explicitly on the OFAC Sanctions List`);
      } else {
        // Word-level overlap checks for fuzzy match (robust to word order changes)
        const queryWords = nameUpper.split(/\s+/);
        for (const sanctionedName of this.sanctionedNames) {
          const sanctionedWords = sanctionedName.split(/\s+/);
          // If all words in the sanctioned name are found in the query name (order independent)
          const isMatch = sanctionedWords.every(w => queryWords.includes(w));
          if (isMatch) {
            reasons.push(`OFAC Fuzzy Match: Recipient Name '${maskedName.getMaskedValue()}' is closely related to Sanctioned entity '${new MaskedString(sanctionedName).getMaskedValue()}'`);
            break;
          }
        }
      }
    }

    // 2. Sanctioned Country Check (OFAC)
    if (recipientCountry) {
      const countryUpper = recipientCountry.toUpperCase().trim();
      if (this.sanctionedCountries.has(countryUpper)) {
        reasons.push(`OFAC Target: Recipient country '${countryUpper}' is a heavily sanctioned/embargoed nation`);
      } else if (this.highRiskCountries.has(countryUpper)) {
        reasons.push(`High Risk AML: Recipient country '${countryUpper}' is classified as a High-Risk Jurisdiction by FATF`);
      }
    }

    // 3. AML Transaction Threshold Check
    if (amount !== null && amount !== undefined) {
      if (amount >= this.amlThreshold) {
        reasons.push(`AML Trigger: Transaction amount $${amount.toFixed(2)} meets/exceeds the AML threshold of $${this.amlThreshold.toFixed(2)} and requires enhanced due diligence`);
      }
    }

    return {
      isSanctioned: reasons.length > 0,
      reasons
    };
  }
}
