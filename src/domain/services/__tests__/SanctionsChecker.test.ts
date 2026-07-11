import { describe, test, expect, beforeAll } from "vitest";
import { SanctionsChecker } from "../SanctionsChecker.js";

describe("SanctionsChecker compliance rules", () => {
  let checker: SanctionsChecker;

  beforeAll(() => {
    // amlThreshold = 10000.00
    checker = new SanctionsChecker(10000.00);
  });

  test("should allow safe transactions under threshold with clean names and countries", () => {
    const result = checker.check("Jane Doe", "US", 500.00);
    expect(result.isSanctioned).toBe(false);
    expect(result.reasons.length).toBe(0);
  });

  test("should flag OFAC exact name matches case-insensitively", () => {
    const result = checker.check("Vladimir Petrov", "US", 200.00);
    expect(result.isSanctioned).toBe(true);
    expect(result.reasons[0]).toContain("OFAC Match");
  });

  test("should flag OFAC fuzzy name matches", () => {
    const result = checker.check("Petrov Vladimir Alexander", "US", 200.00);
    expect(result.isSanctioned).toBe(true);
    expect(result.reasons[0]).toContain("OFAC Fuzzy Match");
  });

  test("should flag OFAC target countries", () => {
    const result = checker.check("John Smith", "KP", 100.00); // North Korea (KP)
    expect(result.isSanctioned).toBe(true);
    expect(result.reasons[0]).toContain("OFAC Target");
  });

  test("should flag high risk AML countries", () => {
    const result = checker.check("John Smith", "RU", 100.00); // Russia (RU)
    expect(result.isSanctioned).toBe(true);
    expect(result.reasons[0]).toContain("High Risk AML");
  });

  test("should flag transaction exceeding AML threshold", () => {
    const result = checker.check("Jane Doe", "US", 25000.00); // Threshold 10,000
    expect(result.isSanctioned).toBe(true);
    expect(result.reasons[0]).toContain("AML Trigger");
  });

  test("performance SLA: check execution must run in under 2ms", () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      checker.check("Jane Doe", "US", 500.00);
    }
    const duration = performance.now() - start;
    const avgLatency = duration / 1000;
    
    expect(avgLatency).toBeLessThan(2.0); // Must be under 2ms per check (SLA is 50ms total)
    console.log(`[PERFORMANCE] SanctionsChecker Avg Latency: ${avgLatency.toFixed(4)}ms`);
  });
});
