import type { CookieOptions, Request } from "express";
import { ONE_DAY_MS } from "@shared/const";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "expires" | "httpOnly" | "maxAge" | "path" | "sameSite" | "secure"> {
  // const hostname = req.hostname;
  // const shouldSetDomain =
  //   hostname &&
  //   !LOCAL_HOSTS.has(hostname) &&
  //   !isIpAddress(hostname) &&
  //   hostname !== "127.0.0.1" &&
  //   hostname !== "::1";

  // const domain =
  //   shouldSetDomain && !hostname.startsWith(".")
  //     ? `.${hostname}`
  //     : shouldSetDomain
  //       ? hostname
  //       : undefined;

  // Lax e o comportamento mais estavel para app no mesmo dominio, inclusive no retorno do OAuth.
  const isProduction = process.env.NODE_ENV === "production";
  const secure = isProduction ? true : isSecureRequest(req);
  const sameSite: CookieOptions["sameSite"] = "lax";
  const expires = new Date(Date.now() + ONE_DAY_MS);

  return {
    httpOnly: true,
    maxAge: ONE_DAY_MS,
    expires,
    path: "/",
    sameSite,
    secure,
  };
}
