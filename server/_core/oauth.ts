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

/**
 * Retorna a base URL canônica da aplicação.
 * Se APP_BASE_URL estiver definida (Railway → https://www.therailapp.com.br),
 * usa ela. Caso contrário, detecta a partir do request (fallback para dev).
 */
function getBaseUrl(req: Request): string {
  // Variável de ambiente explícita tem prioridade absoluta
  const envBase = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  if (envBase) return envBase;

  // Fallback: detecta pelo header x-forwarded-proto + host (funciona no Railway)
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)
      ?.split(",")[0]
      ?.trim() || req.protocol;
  const host = req.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

function getGoogleRedirectUri(req: Request): string {
  return `${getBaseUrl(req)}/api/oauth/google/callback`;
}

function oauthStateCookieOptions(req: Request) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const, // lax é necessário para o redirect do Google funcionar
    secure: req.protocol === "https" ||
      (req.headers["x-forwarded-proto"] as string | undefined)?.includes("https") === true,
    maxAge: OAUTH_COOKIE_MAX_AGE_MS,
  };
}

function getCookieValue(req: Request, key: string): string {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return "";
  const parsed = parseCookieHeader(cookieHeader);
  return String(parsed[key] || "");
}

function safeError(message: string): string {
  return encodeURIComponent(message);
}

function redirectWithError(res: Response, message: string): void {
  res.redirect(`/login?oauthError=${safeError(message)}`);
}

function createOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function registerOAuthRoutes(app: Express) {
  // Inicia o fluxo OAuth com Google
  app.get("/api/oauth/google", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      console.error("[OAuth] GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET não configurados.");
      redirectWithError(res, "Login com Google nao configurado no servidor.");
      return;
    }

    const state = createOAuthState();
    res.cookie(GOOGLE_STATE_COOKIE, state, oauthStateCookieOptions(req));

    const redirectUri = getGoogleRedirectUri(req);
    console.log(`[OAuth] Iniciando Google OAuth → redirect_uri: ${redirectUri}`);

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    url.searchParams.set("access_type", "online");

    res.redirect(url.toString());
  });

  // Callback do Google após autorização
  app.get("/api/oauth/google/callback", async (req, res) => {
    const cookieOptions = oauthStateCookieOptions(req);

    try {
      const error = String(req.query.error || "");
      if (error) {
        const reason = String(req.query.error_description || "A autorizacao foi cancelada.");
        console.warn(`[OAuth] Google retornou erro: ${error} — ${reason}`);
        redirectWithError(res, reason);
        return;
      }

      const code = String(req.query.code || "");
      const state = String(req.query.state || "");
      const stateCookie = getCookieValue(req, GOOGLE_STATE_COOKIE);

      console.log(`[OAuth] Callback recebido — state match: ${state === stateCookie}, code presente: ${!!code}`);

      if (!code || !state || !stateCookie || state !== stateCookie) {
        console.error("[OAuth] Falha de validação de state cookie.", {
          hasCode: !!code,
          hasState: !!state,
          hasStateCookie: !!stateCookie,
          stateMatch: state === stateCookie,
        });
        redirectWithError(res, "Falha de seguranca no login Google. Tente novamente.");
        return;
      }

      const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
      if (!clientId || !clientSecret) {
        redirectWithError(res, "Login com Google nao configurado no servidor.");
        return;
      }

      const redirectUri = getGoogleRedirectUri(req);
      console.log(`[OAuth] Trocando code por token → redirect_uri: ${redirectUri}`);

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
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 15000,
        }
      );

      const accessToken = String(tokenResponse.data?.access_token || "");
      if (!accessToken) {
        console.error("[OAuth] Google não retornou access_token.");
        redirectWithError(res, "Nao foi possivel autenticar com Google.");
        return;
      }

      const userInfoRes = await axios.get("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
      });

      const googleSub = String(userInfoRes.data?.sub || "");
      const email = String(userInfoRes.data?.email || "").trim().toLowerCase();
      const emailVerified = Boolean(userInfoRes.data?.email_verified);
      const name = String(userInfoRes.data?.name || "").trim().replace(/\s+/g, " ") || "Usuario";
      const picture = String(userInfoRes.data?.picture || "").trim() || null;

      console.log(`[OAuth] Usuário Google identificado: ${email} (verified: ${emailVerified})`);

      if (!googleSub || !email || !emailVerified) {
        redirectWithError(res, "Sua conta Google precisa ter e-mail verificado.");
        return;
      }

      const googleOpenId = `google_${googleSub}`;
      let sessionOpenId = googleOpenId;

      // 1. Já existe conta vinculada ao Google (openId = google_xxx)
      const existingGoogleUser = await getUserByOpenId(googleOpenId);

      if (existingGoogleUser) {
        console.log(`[OAuth] Conta Google existente encontrada: id=${existingGoogleUser.id}`);
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
        // 2. Existe conta com mesmo e-mail (criada por email/senha ou outro método)
        const existingEmailUser = await getUserByEmail(email);

        if (existingEmailUser) {
          console.log(`[OAuth] Vinculando Google à conta existente por e-mail: id=${existingEmailUser.id}`);
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
          // 3. Novo usuário — cria conta
          console.log(`[OAuth] Criando nova conta para: ${email}`);
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
      console.log(`[OAuth] Login Google concluído com sucesso para: ${email}`);
      res.redirect("/");
    } catch (error: any) {
      console.error("[OAuth] Google callback falhou:", error?.response?.data || error?.message || error);
      res.clearCookie(GOOGLE_STATE_COOKIE, cookieOptions);
      redirectWithError(res, "Falha ao entrar com Google. Tente novamente.");
    }
  });
}
