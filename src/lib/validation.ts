import { z } from "zod";
import { EXTENSION_PRESETS, TEMPLATE_PLACEHOLDERS } from "@/lib/constants";
import { isValidIsoDate, isValidTimeZone } from "@/lib/dates";
import {
  codeMessage,
  readCodedMessage,
  type CodedValidationFailure,
} from "@/lib/validation-codes";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const optionalInteger = (minimum: number, maximum: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value === "string") return Number(value);
    return value;
  }, z.number().int().min(minimum).max(maximum).optional());

const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .refine((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15;
  }, codeMessage("phoneInvalid"));

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});

/**
 * Password strength rules for any newly chosen password, whether it arrives
 * through sign-up, a reset or an in-app change. Centralised so the three paths
 * cannot drift apart.
 */
export const newPasswordSchema = z
  .string()
  .min(12, codeMessage("passwordMin"))
  .max(200)
  .regex(/[a-z]/, codeMessage("passwordLower"))
  .regex(/[A-Z]/, codeMessage("passwordUpper"))
  .regex(/\d/, codeMessage("passwordNumber"))
  .regex(/[^A-Za-z0-9]/, codeMessage("passwordSymbol"));

/**
 * Sign-up. The invitation code is the only thing that decides which tenant the
 * new account lands in; there is deliberately no tenant id, slug or "join
 * existing parish" field to submit, because a client-chosen tenant is exactly
 * the value this system must never accept from a request.
 */
export const registrationSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(1, codeMessage("inviteRequired"))
    .max(64)
    .transform((value) => value.toUpperCase().replace(/[^0-9A-Z]/g, "")),
  name: z.string().trim().min(2, codeMessage("nameRequired")).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: newPasswordSchema,
  tenantName: optionalText(120),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(10).max(200),
  password: newPasswordSchema,
});

export const inviteCreateSchema = z.object({
  email: optionalText(254).pipe(z.string().email().max(254).optional()),
  role: z.enum(["PRIEST", "TENANT_ADMIN"]).default("PRIEST"),
  maxUses: z.coerce.number().int().min(1).max(50).default(1),
  validityDays: z.coerce.number().int().min(1).max(90).default(14),
});

export const memberCreateSchema = z.object({
  name: z.string().trim().min(2, codeMessage("nameRequired")).max(120),
  phone: optionalText(30).pipe(phoneSchema.optional()),
  customIntervalDays: optionalInteger(1, 365),
  lastConfessionDate: optionalText(10).refine(
    (value) => value === undefined || isValidIsoDate(value),
    codeMessage("invalidDate"),
  ),
  administrativeNote: optionalText(280),
});

export const memberUpdateSchema = memberCreateSchema
  .omit({ lastConfessionDate: true })
  .extend({ id: z.string().cuid() });

export const recordConfessionSchema = z.object({
  memberId: z.string().cuid(),
  confessionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isValidIsoDate, codeMessage("invalidDate")),
});

export const memberIdSchema = z.string().cuid();

export const extendMemberSchema = z.object({
  memberId: z.string().cuid(),
  days: z
    .number()
    .int()
    .refine((days) => (EXTENSION_PRESETS as readonly number[]).includes(days), {
      // The list is interpolated rather than written into the sentence, so the
      // two dictionaries can each place it where their own grammar wants it and
      // neither has to be edited when a preset is added.
      message: codeMessage("extensionNotOffered", { list: EXTENSION_PRESETS.join(", ") }),
    }),
});

export const settingsSchema = z
  .object({
    defaultIntervalDays: z.coerce.number().int().min(1).max(365),
    dueSoonThresholdDays: z.coerce.number().int().min(0).max(90),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(isValidTimeZone, codeMessage("timezoneInvalid")),
    dateFormat: z.enum(["DD/MM/YYYY", "D MMM YYYY"]),
    whatsappCountryCode: z
      .string()
      .trim()
      .regex(/^\d{1,4}$/, codeMessage("countryCodeInvalid")),
    whatsappTemplate: z
      .string()
      .trim()
      .min(1, codeMessage("templateRequired"))
      .max(1_000)
      .superRefine((value, context) => {
        const placeholders = Array.from(
          value.matchAll(/{{\s*([^{}]+?)\s*}}/g),
          (match) => match[1],
        );
        const known = new Set<string>(TEMPLATE_PLACEHOLDERS);
        const unknown = placeholders.find((placeholder) => !known.has(placeholder));
        if (unknown) {
          context.addIssue({
            code: "custom",
            message: codeMessage("unknownPlaceholder", { token: `{{${unknown}}}` }),
          });
        }
        if (!placeholders.includes("name")) {
          context.addIssue({
            code: "custom",
            message: codeMessage("templateNeedsName", { nameToken: "{{name}}" }),
          });
        }
      }),
  })
  .superRefine((value, context) => {
    if (value.dueSoonThresholdDays >= value.defaultIntervalDays) {
      context.addIssue({
        code: "custom",
        path: ["dueSoonThresholdDays"],
        message: codeMessage("thresholdTooHigh"),
      });
    }
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z
      .string()
      .min(12, codeMessage("passwordMin"))
      .max(200)
      .regex(/[a-z]/, codeMessage("passwordLower"))
      .regex(/[A-Z]/, codeMessage("passwordUpper"))
      .regex(/\d/, codeMessage("passwordNumber"))
      .regex(/[^A-Za-z0-9]/, codeMessage("passwordSymbol")),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: codeMessage("passwordSame"),
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegistrationInput = z.infer<typeof registrationSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;
export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export function formDataToObject(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}

/**
 * Recovers a code from the first issue in a Zod error.
 *
 * A message stamped with `codeMessage` is the preferred source: it knows exactly
 * which rule a schema author meant. Everything else is inferred from the issue's
 * own `code`, which is how bounds declared without a custom message still come
 * out as "at least {min} characters" in the reader's language instead of Zod's
 * built-in English.
 */
function codeFromIssueKind(issue: z.core.$ZodIssue): CodedValidationFailure {
  switch (issue.code) {
    case "too_small": {
      const minimum = "minimum" in issue ? Number(issue.minimum) : undefined;
      return {
        code: "tooShort",
        params: minimum === undefined ? {} : { min: minimum },
      };
    }
    case "too_big": {
      const maximum = "maximum" in issue ? Number(issue.maximum) : undefined;
      return {
        code: "tooLong",
        params: maximum === undefined ? {} : { max: maximum },
      };
    }
    case "invalid_format":
      return "format" in issue && issue.format === "email"
        ? { code: "emailInvalid", params: {} }
        : { code: "invalidInput", params: {} };
    default:
      return { code: "invalidInput", params: {} };
  }
}

export function firstValidationFailure(error: z.ZodError): CodedValidationFailure {
  const issue = error.issues[0];
  if (!issue) return { code: "invalidInput", params: {} };
  return readCodedMessage(issue.message) ?? codeFromIssueKind(issue);
}
