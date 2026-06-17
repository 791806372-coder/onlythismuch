import { z } from "zod";

export const UsageReasonSchema = z.enum([
  "no_stable_source",
  "third_party_no_quota",
  "not_logged_in",
  "collector_error",
]);

export const UsageSourceSchema = z.enum([
  "codex_app_server",
  "codexbar",
  "claude_code_tty",
]);

const IsoDateStringSchema = z.string().datetime({ offset: true });
const PercentSchema = z.number().int().min(0).max(100);

const AvailableUsageSchema = z
  .object({
    available: z.literal(true),
    source: UsageSourceSchema,
    sourceVersion: z.string().max(40).optional(),
    fiveHourRemainingPercent: PercentSchema,
    fiveHourResetAt: IsoDateStringSchema,
    weeklyRemainingPercent: PercentSchema,
    weeklyResetAt: IsoDateStringSchema,
  })
  .strict();

const UnavailableUsageSchema = z
  .object({
    available: z.literal(false),
    reason: UsageReasonSchema,
  })
  .strict();

export const UsageSchema = z.discriminatedUnion("available", [
  AvailableUsageSchema,
  UnavailableUsageSchema,
]);

export const ProviderSchema = z
  .object({
    id: z.enum(["claude", "codex"]),
    displayName: z.string().min(1).max(40),
    connected: z.boolean(),
    health: z.enum(["working", "degraded", "error", "unknown"]),
    version: z.string().max(40).optional(),
    capturedAt: IsoDateStringSchema.optional(),
    usage: UsageSchema,
    error: z
      .object({
        code: z.string().max(40),
        message: z.string().max(120),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((provider, ctx) => {
    if (provider.usage.available && !provider.capturedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["capturedAt"],
        message: "capturedAt is required when usage is available",
      });
    } else if (!provider.usage.available && provider.capturedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["capturedAt"],
        message: "capturedAt is only allowed when usage is available",
      });
    }
  });

export const SnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    device: z
      .object({
        id: z.string().min(1).max(80),
        name: z.string().min(1).max(80),
        platform: z.enum(["macOS", "Windows", "Linux"]),
        connectorVersion: z.string().max(40),
        online: z.boolean(),
        updatedAt: IsoDateStringSchema,
      })
      .strict(),
    providers: z.array(ProviderSchema).length(2),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const ids = snapshot.providers.map((provider) => provider.id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== 2 || !uniqueIds.has("claude") || !uniqueIds.has("codex")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providers"],
        message: "V1 snapshots must contain exactly one Claude provider and one Codex provider",
      });
    }
  });

export type Snapshot = z.infer<typeof SnapshotSchema>;

const FORBIDDEN_KEY_RE = /token|cookie|secret|key|credential|password|passphrase|passwd/i;
const MAX_SAFE_STRING_LENGTH = 200;
const EMAIL_VALUE_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const NETWORK_VALUE_RE = /\b(?:https?:\/\/|[a-z][a-z0-9+.-]*:\/\/|localhost|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.local)\b/i;
const FORBIDDEN_VALUE_RE = /\b(?:api[_-]?token|authorization|bearer|cookie|secret|credential|password|passphrase|passwd|keychain|transcript|raw\s+(?:stdout|stderr|log|output)|provider\s+output)\b/i;

export function assertSafeSnapshot(value: unknown): void {
  inspect(value, "$");
}

export function parseSnapshot(value: unknown): Snapshot {
  assertSafeSnapshot(value);
  const parsed = SnapshotSchema.parse(value);
  assertSafeSnapshot(parsed);
  return parsed;
}

function inspect(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (value.length > MAX_SAFE_STRING_LENGTH) {
      throw new Error(`string too long at ${path}`);
    }
    if (EMAIL_VALUE_RE.test(value)) {
      throw new Error(`email-like value at ${path}`);
    }
    if (NETWORK_VALUE_RE.test(value)) {
      throw new Error(`network-like value at ${path}`);
    }
    if (FORBIDDEN_VALUE_RE.test(value)) {
      throw new Error(`forbidden value at ${path}`);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => inspect(item, `${path}[${index}]`));
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(`forbidden key at ${path}.${key}`);
    }
    inspect(nested, `${path}.${key}`);
  }
}
