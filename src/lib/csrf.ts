/**
 * Same-origin verification for state-changing browser requests.
 *
 * Comparing the `Origin` header against `request.url` is unreliable behind a reverse proxy:
 * Next.js builds `request.url` from the hostname the Node process is bound to (and from
 * `x-forwarded-proto` for the scheme), not from the public `Host` header. A deployment such as
 * `https://attendance.example.com` -> `http://127.0.0.1:3000` therefore produces a request whose
 * URL is `https://localhost:3000/...`, and a strict origin comparison rejects every legitimate
 * browser request.
 *
 * The defence therefore compares *hosts* rather than full origins, accepting the `Host` header
 * (which the browser derives from the request URL and page scripts cannot override) and, as a
 * fallback, a single `X-Forwarded-Host` value for proxies that rewrite `Host` to the upstream.
 * Ignoring the scheme is safe here because the session cookie is a `Secure`, `SameSite=Strict`,
 * `__Host-` cookie: a cross-site caller cannot cause the browser to attach it, and a same-host
 * attacker is already authenticated.
 */

const ALLOWED_SEC_FETCH_SITE_VALUES = new Set(["same-origin", "none"]);

function hostFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Parses a bare `host[:port]` header value, which is not itself a parseable URL. */
function hostFromHeader(value: string | null): string | null {
  if (!value) return null;
  // `X-Forwarded-Host` may hold a comma-separated proxy chain; the client-facing value is first.
  const first = value.split(",")[0]?.trim();
  if (!first) return null;
  return hostFromUrl(`http://${first}`);
}

function getExpectedHosts(request: Request): Set<string> {
  const hosts = new Set<string>();
  const host = hostFromHeader(request.headers.get("host"));
  if (host) hosts.add(host);
  const forwardedHost = hostFromHeader(request.headers.get("x-forwarded-host"));
  if (forwardedHost) hosts.add(forwardedHost);
  return hosts;
}

export function isSameOriginRequest(request: Request): boolean {
  // `Sec-Fetch-Site` is set by the user agent, cannot be overridden by page scripts, and is
  // unaffected by proxy host rewriting, so prefer it whenever the browser supplies it.
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite) {
    return ALLOWED_SEC_FETCH_SITE_VALUES.has(secFetchSite.toLowerCase());
  }

  const expectedHosts = getExpectedHosts(request);
  if (expectedHosts.size === 0) return false;

  const origin = request.headers.get("origin");
  if (origin) {
    const originHost = hostFromUrl(origin);
    return originHost !== null && expectedHosts.has(originHost);
  }

  const referer = request.headers.get("referer");
  if (referer) {
    const refererHost = hostFromUrl(referer);
    return refererHost !== null && expectedHosts.has(refererHost);
  }

  // No browser-supplied origin signal: this is a non-browser client (for example an operator's
  // authenticated CLI). `SameSite=Strict` prevents a browser from attaching the session cookie to
  // a cross-site request, so there is no cross-site vector to reject here.
  return true;
}
