import type { Express, Request, Response } from "express";
import axios from "axios";
import { randomBytes } from "crypto";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { getUserByEmail, getUserByNickname, getUserByOpenId, linkUserToGoogle, upsertUser } from "../db";

const GOOGLE_STATE_COOKIE = "oauth_state_google";
const OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

function getBaseUrl(req: Request) {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() || req.protocol;
  const host = req.get("host");
  return `${proto}://${host}`;
}

function getGoogleRedirectUri(req: Request) {
  return `${getBaseUrl(req)}/api/oauth/google/callback`;
}

function oauthStateCookieOptions(req: Request) {
  return {
    ...getSessionCookieOptions(req),
    sameSite: "lax" as const,
    maxAge: OAUTH_COOKIE_MAX_AGE_MS,
  };
}

function getCookieValue(req: Request, key: string) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return "";
  const parsed = parseCookieHeader(cookieHeader);
  return String(parsed[key] || "");
}

function safeError(message: string) {
  return encodeURIComponent(message);
}

function redirectWithError(res: Response, message: string) {
  res.redirect(`/login?oauthError=${safeError(message)}`);
}

function createOAuthState() {
  return randomBytes(24).toString("hex");
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/google", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      redirectWithError(res, "Login com Google nao configurado no servidor.");
      return;
    }

    const state = createOAuthState();
    res.cookie(GOOGLE_STATE_COOKIE, state, oauthStateCookieOptions(req));

    const redirectUri = getGoogleRedirectUri(req);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");

    res.redirect(url.toString());
  });

  app.get("/api/oauth/google/callback", async (req, res) => {
    const cookieOptions = oauthStateCookieOptions(req);

    try {
      const error = String(req.query.error || "");
      if (error) {
        const reason = String(req.query.error_description || "A autorizacao foi cancelada.");
        redirectWithError(res, reason);
        return;
      }

      const code = String(req.query.code || "");
      const state = String(req.query.state || "");
      const stateCookie = getCookieValue(req, GOOGLE_STATE_COOKIE);

      if (!code || !state || !stateCookie || state !== stateCookie) {
        redirectWithError(res, "Falha de seguranca no login Google. Tente novamente.");
        return;
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        redirectWithError(res, "Login com Google nao configurado no servidor.");
        return;
      }

      const redirectUri = getGoogleRedirectUri(req);
      const tokenResponse = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 15000,
        }
      );

      const accessToken = String(tokenResponse.data?.access_token || "");
      if (!accessToken) {
        redirectWithError(res, "Nao foi possivel autenticar com Google.");
        return;
      }

      const userInfo = await axios.get("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 15000,
      });

      const googleSub = String(userInfo.data?.sub || "");
      const email = String(userInfo.data?.email || "").trim().toLowerCase();
      const emailVerified = Boolean(userInfo.data?.email_verified);
      const name = String(userInfo.data?.name || "").trim().replace(/\s+/g, " ") || "Usuario";
      const picture = String(userInfo.data?.picture || "").trim() || null;

      if (!googleSub || !email || !emailVerified) {
        redirectWithError(res, "Sua conta Google precisa ter e-mail verificado.");
        return;
      }

      const googleOpenId = `google_${googleSub}`;
      let sessionOpenId = googleOpenId;

      const existingGoogleUser = await getUserByOpenId(googleOpenId);

      if (existingGoogleUser) {
        await upsertUser({
          openId: existingGoogleUser.openId,
          name: existingGoogleUser.name ?? name,
          email,
          avatarUrl: picture,
          loginMethod: "google",
          lastSignedIn: new Date(),
        });
        sessionOpenId = existingGoogleUser.openId;
      } else {
        const existingEmailUser = await getUserByEmail(email);

        if (existingEmailUser) {
          if (!existingEmailUser.name) {
            const duplicateNickname = await getUserByNickname(name);
            if (duplicateNickname && duplicateNickname.id !== existingEmailUser.id) {
              redirectWithError(res, "Esse nickname ja esta em uso. Entre com e-mail e escolha outro nickname.");
              return;
            }
          }
          const linked = await linkUserToGoogle({
            userId: existingEmailUser.id,
            googleSub,
            name: existingEmailUser.name ?? name,
            email,
            avatarUrl: picture,
          });
          sessionOpenId = linked.openId;
        } else {
          const duplicateNickname = await getUserByNickname(name);
          if (duplicateNickname) {
            redirectWithError(res, "Esse nickname ja esta em uso. Escolha outro ao criar sua conta.");
            return;
          }
          await upsertUser({
            openId: googleOpenId,
            name,
            email,
            avatarUrl: picture,
            loginMethod: "google",
            lastSignedIn: new Date(),
          });
          sessionOpenId = googleOpenId;
        }
      }

      const token = await sdk.createSessionToken(sessionOpenId, { name });
      res.cookie(COOKIE_NAME, token, getSessionCookieOptions(req));
      res.clearCookie(GOOGLE_STATE_COOKIE, cookieOptions);
      res.redirect("/");
    } catch (error) {
      console.error("[OAuth] Google callback failed:", error);
      res.clearCookie(GOOGLE_STATE_COOKIE, cookieOptions);
      redirectWithError(res, "Falha ao entrar com Google. Tente novamente.");
    }
  });
}
