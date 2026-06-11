import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";

export const PASSWORD_SETUP_COOKIE = "auth_password_setup_pending";
const PASSWORD_SETUP_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;

export type PasswordSetupPayload = {
  kind: "password_setup";
  email: string;
};

function getJwtSecret() {
  const secret = String(ENV.cookieSecret || "").trim();
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

function isSecureRequest(req: Request) {
  return (
    req.protocol === "https" ||
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() === "https"
  );
}

export function getPasswordSetupCookieOptions(req: Request) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: isSecureRequest(req),
    maxAge: PASSWORD_SETUP_COOKIE_MAX_AGE_MS,
  };
}

export async function createPasswordSetupToken(payload: PasswordSetupPayload) {
  const expirationSeconds = Math.floor((Date.now() + PASSWORD_SETUP_COOKIE_MAX_AGE_MS) / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getJwtSecret());
}

export async function verifyPasswordSetupToken(token: string | undefined | null): Promise<PasswordSetupPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
    const data = payload as Record<string, unknown>;
    if (data.kind !== "password_setup" || typeof data.email !== "string") {
      return null;
    }
    return {
      kind: "password_setup",
      email: data.email,
    };
  } catch {
    return null;
  }
}
