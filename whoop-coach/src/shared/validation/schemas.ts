import { z } from "zod";

export const environmentSchema = z.object({
  PUBLIC_BASE_URL: z.url().transform((value) => value.replace(/\/$/, "")),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  AUTH0_ISSUER_BASE_URL: z.url(),
  AUTH0_AUDIENCE: z.string().min(1),
  AUTH0_ALLOWED_SUBJECT: z.string().min(1).optional(),
  WHOOP_CLIENT_ID: z.string().min(1),
  WHOOP_CLIENT_SECRET: z.string().min(1),
  WHOOP_REDIRECT_URI: z.url(),
  WHOOP_SCOPES: z.string().default("offline read:profile read:cycles read:recovery read:sleep read:workout read:body_measurement"),
  DATABASE_URL: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  WHOOP_RECONCILIATION_CRON: z.string().default("7 * * * *"),
  WHOOP_RECONCILIATION_LOOKBACK_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  WHOOP_INITIAL_SYNC_DAYS: z.coerce.number().int().min(7).max(365).default(90),
});

export type Environment = z.infer<typeof environmentSchema>;

export const whoopWebhookSchema = z.object({
  user_id: z.number().int().positive(),
  id: z.union([z.string().uuid(), z.number().int().positive()]).transform(String),
  type: z.enum([
    "workout.updated",
    "workout.deleted",
    "sleep.updated",
    "sleep.deleted",
    "recovery.updated",
    "recovery.deleted",
  ]),
  trace_id: z.string().uuid(),
});

export const updateCoachProfileSchema = z.object({
  primarySport: z.string().trim().min(1).max(80),
  goals: z.array(z.string().trim().min(1).max(200)).max(10),
  weeklySchedule: z.record(z.string(), z.unknown()),
  injuryConstraints: z.array(z.string().trim().min(1).max(200)).max(10),
  targetEventDate: z.iso.date().nullable(),
});
