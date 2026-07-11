import { z } from "zod";

/**
 * Zod schema to validate incoming traffic events at the boundary (controller level).
 */
export const TrafficEventSchema = z.object({
  source: z.enum(["API", "FlatFile", "DbCommit", "UserInput"]),
  payloadType: z.enum(["JSON", "text", "sql"]),
  payload: z.string().min(1, "Payload cannot be empty"),
  actorId: z.string().min(1, "Actor ID is required"),
  ipAddress: z.string().ip().optional().nullable(),
  location: z.string().optional().nullable(),
  amount: z.number().nonnegative("Amount must be a positive number").optional().nullable(),
  currency: z.string().length(3, "Currency must be a 3-letter ISO code").optional().nullable(),
  recipientName: z.string().optional().nullable(),
  recipientCountry: z.string().length(2, "Country must be a 2-letter ISO code").optional().nullable(),
});

export type TrafficEventInput = z.infer<typeof TrafficEventSchema>;

/**
 * Helper to sanitize inputs (e.g. trimming strings and removing basic script tags).
 */
export function sanitizeInput(input: TrafficEventInput): TrafficEventInput {
  return {
    ...input,
    payload: input.payload.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "[REDACTED_SCRIPT]"),
    actorId: input.actorId.trim(),
    recipientName: input.recipientName ? input.recipientName.trim() : null,
    recipientCountry: input.recipientCountry ? input.recipientCountry.trim().toUpperCase() : null,
    currency: input.currency ? input.currency.trim().toUpperCase() : null,
  };
}
