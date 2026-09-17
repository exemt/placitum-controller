import type { IncomingHttpHeaders } from "node:http";

import type { NextFunction, Request, Response } from "express";

// The API has no login of its own: a browser that reaches it, directly or through the panel
// gate with its session cookie, acts as the operator. A page of another origin must not.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // MUI and emotion inject <style> at runtime; the font sheet is the one outside resource.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const API_CSP = "default-src 'none'; frame-ancestors 'none'";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseTrustedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter((item) => item !== "");
}

// A request with no Origin and no Sec-Fetch-Site comes from a tool, not from a page: the
// installer, e2e, curl. Browsers send Origin on every request that is not GET or HEAD and on
// every WebSocket handshake.
export function originAllowed(headers: IncomingHttpHeaders, trusted: readonly string[]): boolean {
  const origin = first(headers.origin);
  const site = first(headers["sec-fetch-site"]);

  if (origin !== "" && trusted.includes(origin)) {
    return true;
  }

  if (site !== "") {
    return site === "same-origin" || site === "none";
  }

  if (origin === "") {
    return true;
  }

  let from: URL;

  try {
    from = new URL(origin);
  } catch {
    return false;
  }

  const host = first(headers.host).toLowerCase();

  // The node forwards Host without the port ($host), so only the name is left to compare.
  return host !== "" && (from.host === host || from.hostname === host);
}

export function originGuard(trusted: readonly string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method) || originAllowed(req.headers, trusted)) {
      next();
      return;
    }

    res.status(403).json({ error: "cross_origin" });
  };
}

export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const api = req.path === "/api" || req.path.startsWith("/api/");

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Content-Security-Policy", api ? API_CSP : PAGE_CSP);

    if (api) {
      res.setHeader("Cache-Control", "private, no-cache");
    }

    next();
  };
}
