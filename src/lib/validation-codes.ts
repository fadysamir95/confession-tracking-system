import type { Dictionary } from "@/lib/dictionaries/en";
import { fill } from "@/lib/i18n";

/**
 * Validation failures as codes, for the same reason domain errors are: a Zod
 * schema that carries a finished English sentence has already made a
 * translation decision, and it makes it before anyone has said which language
 * the person in front of the screen reads.
 *
 * Two kinds of rule end up here:
 *
 * - Checks where the *kind* of problem is the message — "phone number is
 *   invalid", "add a number". These are declared once on the schema.
 * - Checks where only the *kind* is known from Zod itself — a string that is
 *   too long, an email with no `@`. These are recovered from the issue's `code`
 *   and `format`, so adding a length bound somewhere never quietly reintroduces
 *   an English sentence.
 *
 * Anything that reaches neither path collapses to `invalidInput`, which is
 * deliberately vague: an unmapped shape should not describe itself to a stranger
 * probing the endpoint.
 */
export const VALIDATION_CODES = [
  "phoneInvalid",
  "passwordMin",
  "passwordLower",
  "passwordUpper",
  "passwordNumber",
  "passwordSymbol",
  "inviteRequired",
  "nameRequired",
  "timezoneInvalid",
  "countryCodeInvalid",
  "templateRequired",
  "unknownPlaceholder",
  "templateNeedsName",
  "thresholdTooHigh",
  "passwordSame",
  "emailInvalid",
  "tooLong",
  "tooShort",
  "invalidDate",
  "invalidInput",
] as const;

export type ValidationCode = (typeof VALIDATION_CODES)[number];

/**
 * Marks a Zod `message` as carrying a code rather than prose.
 *
 * The payload is JSON so a rule can hand over the one value a human needs to act
 * — which placeholder was misspelled, how long a field may be — without any risk
 * of a delimiter inside that value splitting the message. The string never
 * reaches a person; it is parsed on the way past.
 */
const CODED_MESSAGE_PREFIX = "@@code:";

type MessageSlot = keyof Dictionary["validation"] | keyof Dictionary["errors"];

const SLOT: Record<ValidationCode, MessageSlot> = {
  phoneInvalid: "phoneInvalid",
  passwordMin: "passwordMin",
  passwordLower: "passwordLower",
  passwordUpper: "passwordUpper",
  passwordNumber: "passwordNumber",
  passwordSymbol: "passwordSymbol",
  inviteRequired: "inviteRequired",
  nameRequired: "nameRequired",
  timezoneInvalid: "timezoneInvalid",
  countryCodeInvalid: "countryCodeInvalid",
  templateRequired: "templateRequired",
  unknownPlaceholder: "unknownPlaceholder",
  templateNeedsName: "templateNeedsName",
  thresholdTooHigh: "thresholdTooHigh",
  passwordSame: "passwordSame",
  emailInvalid: "emailInvalid",
  tooLong: "tooLong",
  tooShort: "tooShort",
  invalidDate: "invalidDate",
  invalidInput: "invalidInput",
};

export interface CodedValidationFailure {
  code: ValidationCode;
  params: Record<string, string | number>;
}

/** Stamps a schema message so `validation.ts` stays free of user-facing prose. */
export function codeMessage(
  code: ValidationCode,
  params: Record<string, string | number> = {},
): string {
  return `${CODED_MESSAGE_PREFIX}${JSON.stringify({ code, params })}`;
}

export function readCodedMessage(message: string): CodedValidationFailure | null {
  if (!message.startsWith(CODED_MESSAGE_PREFIX)) return null;
  try {
    const parsed: unknown = JSON.parse(message.slice(CODED_MESSAGE_PREFIX.length));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "code" in parsed &&
      typeof parsed.code === "string" &&
      parsed.code in SLOT
    ) {
      const params =
        "params" in parsed &&
        typeof parsed.params === "object" &&
        parsed.params !== null
          ? (parsed.params as Record<string, string | number>)
          : {};
      return { code: parsed.code as ValidationCode, params };
    }
  } catch {
    // A malformed stamp is treated as ordinary prose, which then falls through
    // to the kind-based mapping below.
  }
  return null;
}

export function validationMessage(
  code: ValidationCode,
  dict: Dictionary,
  params: Record<string, string | number> = {},
): string {
  const slot = SLOT[code];
  const validation = dict.validation as Record<string, string>;
  const errors = dict.errors as Record<string, string>;
  return fill(slot in validation ? validation[slot] : errors[slot], params);
}
