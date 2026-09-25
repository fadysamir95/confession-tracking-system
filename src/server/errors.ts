import type { ErrorCode } from "@/lib/error-codes";

/**
 * A refusal or a conflict the domain can name.
 *
 * It deliberately carries no sentence. The `code` says what happened; the action
 * layer turns it into a message in the reader's language. Anything that reaches
 * a log or a stack trace gets the code, which is both compact and greppable,
 * instead of a translated string that changes with the user's locale.
 *
 * `params` covers the rare message that genuinely needs a value — currently the
 * roster export row cap. Most codes need none.
 */
export class DomainError extends Error {
  /**
   * Declared rather than inferred from the constructor call so that a consumer
   * can read `error.code` off the type alone. Without this the field exists at
   * runtime but TypeScript only ever sees `Error`, and every `catch` block has
   * to cast before it can do anything useful with what it caught.
   */
  readonly code: ErrorCode;
  readonly params: Record<string, string | number>;

  constructor(code: ErrorCode, params: Record<string, string | number> = {}) {
    super(code);
    this.name = "DomainError";
    this.code = code;
    this.params = params;
  }
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
