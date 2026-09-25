import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/lib/csrf";

function buildRequest(headers: Record<string, string>, url = "http://localhost:3000/api/export/members"): Request {
  return new Request(url, { method: "POST", headers });
}

describe("isSameOriginRequest", () => {
  describe("Sec-Fetch-Site (browser-supplied, proxy independent)", () => {
    it("accepts a same-origin browser request", () => {
      const request = buildRequest({
        host: "attendance.example.com",
        "sec-fetch-site": "same-origin",
        origin: "https://attendance.example.com",
      });
      expect(isSameOriginRequest(request)).toBe(true);
    });

    it("rejects a cross-site browser request even when the origin host looks plausible", () => {
      const request = buildRequest({
        host: "attendance.example.com",
        "sec-fetch-site": "cross-site",
        origin: "https://attendance.example.com",
      });
      expect(isSameOriginRequest(request)).toBe(false);
    });

    it("rejects same-site requests, which are not the same origin", () => {
      const request = buildRequest({
        host: "attendance.example.com",
        "sec-fetch-site": "same-site",
        origin: "https://sub.attendance.example.com",
      });
      expect(isSameOriginRequest(request)).toBe(false);
    });

    it("accepts a direct navigation", () => {
      const request = buildRequest({ host: "attendance.example.com", "sec-fetch-site": "none" });
      expect(isSameOriginRequest(request)).toBe(true);
    });
  });

  describe("Origin fallback behind a reverse proxy", () => {
    // Next.js builds request.url from the bound hostname, so a proxied deployment must not compare
    // the Origin header against request.url. These cases pin the public host coming from headers.
    it("accepts a same-origin https request even though request.url is the upstream host", () => {
      const request = buildRequest(
        {
          host: "attendance.example.com",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "attendance.example.com",
          origin: "https://attendance.example.com",
        },
        "https://localhost:3000/api/export/members",
      );
      expect(isSameOriginRequest(request)).toBe(true);
    });

    it("accepts a same-origin request when only the Host header identifies the public name", () => {
      const request = buildRequest(
        { host: "attendance.example.com", origin: "https://attendance.example.com" },
        "https://127.0.0.1:3000/api/export/members",
      );
      expect(isSameOriginRequest(request)).toBe(true);
    });

    it("accepts a proxy that rewrites Host to the upstream and forwards the public host", () => {
      const request = buildRequest(
        {
          host: "127.0.0.1:3000",
          "x-forwarded-host": "attendance.example.com",
          origin: "https://attendance.example.com",
        },
        "https://127.0.0.1:3000/api/export/members",
      );
      expect(isSameOriginRequest(request)).toBe(true);
    });

    it("uses the first value of a comma-separated X-Forwarded-Host chain", () => {
      const request = buildRequest({
        host: "127.0.0.1:3000",
        "x-forwarded-host": "attendance.example.com, internal-proxy.local",
        origin: "https://attendance.example.com",
      });
      expect(isSameOriginRequest(request)).toBe(true);
    });

    it("is case insensitive about the host", () => {
      const request = buildRequest({
        host: "Attendance.Example.COM",
        origin: "https://attendance.example.com",
      });
      expect(isSameOriginRequest(request)).toBe(true);
    });

    it("rejects a genuinely cross-origin request", () => {
      const request = buildRequest({
        host: "attendance.example.com",
        origin: "https://evil.example.com",
      });
      expect(isSameOriginRequest(request)).toBe(false);
    });

    it("rejects a look-alike host suffix", () => {
      const request = buildRequest({
        host: "attendance.example.com",
        origin: "https://attendance.example.com.evil.test",
      });
      expect(isSameOriginRequest(request)).toBe(false);
    });

    it("rejects a mismatched port", () => {
      const request = buildRequest({
        host: "attendance.example.com",
        origin: "https://attendance.example.com:8443",
      });
      expect(isSameOriginRequest(request)).toBe(false);
    });

    it("tolerates a scheme change caused by TLS termination at the proxy", () => {
      const request = buildRequest({
        host: "attendance.example.com",
        "x-forwarded-proto": "https",
        origin: "http://attendance.example.com",
      });
      expect(isSameOriginRequest(request)).toBe(true);
    });

    it("rejects a malformed origin instead of throwing", () => {
      const request = buildRequest({ host: "attendance.example.com", origin: "not-a-url" });
      expect(isSameOriginRequest(request)).toBe(false);
    });
  });

  describe("Referer fallback", () => {
    it("accepts a same-origin referer", () => {
      const request = buildRequest({
        host: "attendance.example.com",
        referer: "https://attendance.example.com/settings",
      });
      expect(isSameOriginRequest(request)).toBe(true);
    });

    it("rejects a cross-origin referer", () => {
      const request = buildRequest({
        host: "attendance.example.com",
        referer: "https://evil.example.com/attack.html",
      });
      expect(isSameOriginRequest(request)).toBe(false);
    });
  });

  describe("non-browser clients", () => {
    it("allows an authenticated client that sends no origin signal", () => {
      expect(isSameOriginRequest(buildRequest({ host: "attendance.example.com" }))).toBe(true);
    });

    it("fails closed when the request carries no host information", () => {
      // A bare fetch-style Request has no Host header, so there is nothing to compare against.
      const request = new Request("http://localhost:3000/api/export/members", {
        method: "POST",
        headers: { origin: "https://attendance.example.com" },
      });
      expect(request.headers.get("host")).toBeNull();
      expect(isSameOriginRequest(request)).toBe(false);
    });
  });
});
