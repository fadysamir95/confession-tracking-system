/**
 * A minimal in-memory stand-in for Next.js's request-scoped cookie store.
 *
 * `cookies()` can only be called while a request is being handled, so anything
 * that reads or writes the session cookie — `createSession`,
 * `destroyCurrentSession`, `getCurrentSession` — is untestable without one. This
 * reproduces enough of the real contract for those paths to run: get, set and
 * delete, plus the attributes a test needs to assert on.
 *
 * The records the real store would serialize are kept intact so tests can check
 * that the session cookie is http-only, same-site strict, and secure in
 * production. A stub that ignored the options would let a regression in cookie
 * hardening pass unnoticed, which is precisely the class of bug these tests
 * exist to catch.
 */
export interface CookieRecord {
  value: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  path?: string;
  expires?: Date;
}

export class FakeCookieStore {
  private readonly jar = new Map<string, CookieRecord>();

  get(name: string): { name: string; value: string } | undefined {
    const record = this.jar.get(name);
    return record ? { name, value: record.value } : undefined;
  }

  set(name: string, value: string, options: Omit<CookieRecord, "value"> = {}): this {
    this.jar.set(name, { value, ...options });
    return this;
  }

  delete(name: string): this {
    this.jar.delete(name);
    return this;
  }

  get size(): number {
    return this.jar.size;
  }

  /** Inspects a stored cookie, for assertions on its security attributes. */
  inspect(name: string): CookieRecord | undefined {
    return this.jar.get(name);
  }

  clear(): void {
    this.jar.clear();
  }
}

/** The store the active mock of `next/headers` will read from. */
export const activeCookieStore = new FakeCookieStore();

/** Builds the module mock for `next/headers` around one cookie store. */
export function cookieHeaderMock(store: FakeCookieStore = activeCookieStore) {
  return {
    cookies: async () => store,
    headers: async () => new Headers(),
  };
}
