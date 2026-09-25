import type { ActionState } from "@/lib/action-state";
import type { Dictionary } from "@/lib/dictionaries/en";
import {
  errorMessage,
  type ErrorCode,
  type ErrorFallback,
} from "@/lib/error-codes";
import { fill } from "@/lib/i18n";
import { getRequestDictionary } from "@/lib/i18n-server";
import {
  validationMessage,
  type CodedValidationFailure,
} from "@/lib/validation-codes";
import { isDomainError } from "@/server/errors";

/**
 * The single point where a thrown value becomes something a person reads.
 *
 * Every server action funnels its `catch` through here, which means there is
 * exactly one place in the codebase that decides how a refusal is phrased, and
 * it always uses the locale of the request being answered rather than the
 * process default.
 */
export async function failureState(
  error: unknown,
  fallback: ErrorFallback,
  params: Record<string, string | number> = {},
): Promise<ActionState> {
  const dict = await getRequestDictionary();

  if (isDomainError(error)) {
    return { ok: false, message: errorMessage(error.code, dict, error.params) };
  }

  return { ok: false, message: fill(dict.errors[fallback], params) };
}

/** A refusal the action itself detected, before any service was called. */
export async function refusalState(
  code: ErrorCode,
  params: Record<string, string | number> = {},
): Promise<ActionState> {
  const dict = await getRequestDictionary();
  return { ok: false, message: errorMessage(code, dict, params) };
}

/**
 * A rejection that never reached a service, because a schema refused it first.
 */
export async function validationFailure(
  failure: CodedValidationFailure,
): Promise<ActionState> {
  const dict = await getRequestDictionary();
  return {
    ok: false,
    message: validationMessage(failure.code, dict, failure.params),
  };
}

/**
 * A confirmation. The key is a `success` entry rather than a literal, for the
 * same reason as the failures: "Member archived." is interface copy, and a
 * saved account should not change language when the server restarts.
 */
export async function confirmationState(
  key: keyof Dictionary["success"],
  params: Record<string, string | number> = {},
): Promise<ActionState> {
  const dict = await getRequestDictionary();
  return { ok: true, message: fill(dict.success[key], params) };
}
