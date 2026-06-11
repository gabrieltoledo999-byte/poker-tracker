import type { Express, Request, Response } from "express";
import axios from "axios";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME, LEGACY_COOKIE_NAMES } from "@shared/const";
import { getSessionCookieClearOptions, getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { SignJWT, jwtVerify } from "jose";
import { sql } from "drizzle-orm";
import { getUserByEmail, getUserByNickname, getUserByOpenId, linkUserToGoogle, upsertUser } from "../db";
import { getDb } from "../db";

const GOOGLE_STATE_COOKIE = "oauth_state_google";
const GOOGLE_PENDING_VERIFY_COOKIE = "oauth_google_pending_verify";
const OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;
const VERIFY_CODE_TTL_MS = 10 * 60 * 1000;
const VERIFY_RESEND_COOLDOWN_MS = 30 * 1000;
const VERIFY_MAX_ATTEMPTS = 6;

type PendingGoogleVerifyPayload = {
  kind: "google_email_verify";
  openId: string;
  name: string;
  email: string;
};

function normalizeEnvValue(value: string | undefined) {
  if (!value) return "";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getGoogleOAuthCredentials() {
  const clientId = normalizeEnvValue(
    process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID
  );
  const clientSecret = normalizeEnvValue(
    process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function getBaseUrl(req: Request): string {
  // Detecta base URL pelo host de origem da requisicao para suportar multi-dominio.
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)
      ?.split(",")[0]
      ?.trim() || req.protocol;
  const host = req.get("host") || "localhost:3000";
  const requestBase = `${proto}://${host}`;

  // Se chegar host local/interno em producao, usa APP_BASE_URL como fallback seguro.
  const envBase = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  const normalizedHost = host.toLowerCase();
  const isLocalHost =
    normalizedHost.startsWith("localhost")
    || normalizedHost.startsWith("127.0.0.1")
    || normalizedHost.startsWith("0.0.0.0");

  if (envBase && isLocalHost) return envBase;
  return requestBase;
}

function getGoogleRedirectUri(req: Request): string {
  return `${getBaseUrl(req)}/api/oauth/google/callback`;
}

function oauthStateCookieOptions(req: Request) {
  // O cookie de estado OAuth precisa de SameSite=Lax para sobreviver ao redirect do Google.
  // Não herda getSessionCookieOptions para evitar conflitos com o flag secure em produção.
  const isSecure =
    req.protocol === "https" ||
    (req.headers["x-forwarded-proto"] as string | undefined)
      ?.split(",")[0]
      ?.trim() === "https";
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: isSecure,
    maxAge: OAUTH_COOKIE_MAX_AGE_MS,
  };
}

function pendingVerifyCookieOptions(req: Request) {
  const isSecure =
    req.protocol === "https" ||
    (req.headers["x-forwarded-proto"] as string | undefined)
      ?.split(",")[0]
      ?.trim() === "https";
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: isSecure,
    maxAge: VERIFY_CODE_TTL_MS,
  };
}

function getJwtSecret() {
  const secret = String(ENV.cookieSecret || "").trim();
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

async function createPendingVerifyToken(payload: PendingGoogleVerifyPayload) {
  const expirationSeconds = Math.floor((Date.now() + VERIFY_CODE_TTL_MS) / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getJwtSecret());
}

async function verifyPendingVerifyToken(token: string | undefined | null): Promise<PendingGoogleVerifyPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
    const data = payload as Record<string, unknown>;
    if (
      data.kind !== "google_email_verify" ||
      typeof data.openId !== "string" ||
      typeof data.name !== "string" ||
      typeof data.email !== "string"
    ) {
      return null;
    }
    return {
      kind: "google_email_verify",
      openId: data.openId,
      name: data.name,
      email: data.email,
    };
  } catch {
    return null;
  }
}

function maskEmail(email: string) {
  const [localPart, domainPart = ""] = String(email || "").split("@");
  if (!localPart || !domainPart) return email;
  const visible = localPart.slice(0, 2);
  const hidden = "*".repeat(Math.max(1, localPart.length - 2));
  return `${visible}${hidden}@${domainPart}`;
}

function buildVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function persistVerificationCode(params: { userId: number; email: string; code: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable for email verification");
  const codeHash = await bcrypt.hash(params.code, 10);
  await db.execute(sql`
    INSERT INTO email_verification_codes (userId, email, purpose, codeHash, expiresAt, maxAttempts)
    VALUES (${params.userId}, ${params.email}, 'google_login', ${codeHash}, ${new Date(Date.now() + VERIFY_CODE_TTL_MS)}, ${VERIFY_MAX_ATTEMPTS})
  `);
}

async function sendVerificationEmail(params: { to: string; code: string; maskedEmail: string }) {
  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
  const fromEmail = String(process.env.AUTH_FROM_EMAIL || "").trim();
  if (!resendApiKey || !fromEmail) {
    throw new Error("RESEND_API_KEY or AUTH_FROM_EMAIL not configured");
  }

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">Confirmacao de login</h2>
      <p>Recebemos uma tentativa de login com Google para <strong>${params.maskedEmail}</strong>.</p>
      <p>Use o codigo abaixo para concluir o acesso:</p>
      <p style="font-size: 28px; letter-spacing: 6px; font-weight: 700; margin: 16px 0;">${params.code}</p>
      <p>Este codigo expira em 10 minutos.</p>
      <p>Se voce nao tentou entrar, ignore este email.</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [params.to],
      subject: "Codigo de verificacao - All in Edge",
      html,
      text: `Seu codigo de verificacao: ${params.code}. Expira em 10 minutos.`,
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Email provider error: ${response.status} ${raw}`);
  }
}

async function issueGoogleVerificationChallenge(req: Request, res: Response, params: { openId: string; name: string; email: string }) {
  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
  const fromEmail = String(process.env.AUTH_FROM_EMAIL || "").trim();
  if (!resendApiKey || !fromEmail) {
    throw new Error("Email verification disabled: missing RESEND_API_KEY or AUTH_FROM_EMAIL");
  }

  const user = await getUserByOpenId(params.openId);
  if (!user?.id) {
    throw new Error("User not found while issuing verification challenge");
  }

  const code = buildVerificationCode();
  await persistVerificationCode({ userId: user.id, email: params.email, code });
  await sendVerificationEmail({ to: params.email, code, maskedEmail: maskEmail(params.email) });

  const pendingToken = await createPendingVerifyToken({
    kind: "google_email_verify",
    openId: params.openId,
    name: params.name,
    email: params.email,
  });
  res.cookie(GOOGLE_PENDING_VERIFY_COOKIE, pendingToken, pendingVerifyCookieOptions(req));
  res.redirect(`/login?verifyEmail=1&email=${encodeURIComponent(params.email)}`);
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

function cookieClearOptions<T extends { expires?: unknown; maxAge?: unknown }>(options: T): Omit<T, "expires" | "maxAge"> {
  const { expires: _expires, maxAge: _maxAge, ...rest } = options;
  return rest as Omit<T, "expires" | "maxAge">;
}

async function finalizeLoginSession(req: Request, res: Response, params: { openId: string; name: string }) {
  const token = await sdk.createSessionToken(params.openId, { name: params.name });
  const sessionCookieOptions = getSessionCookieOptions(req);
  const clearSessionOptions = getSessionCookieClearOptions(req);
  res.cookie(COOKIE_NAME, token, sessionCookieOptions);
  for (const legacyName of LEGACY_COOKIE_NAMES) {
    res.clearCookie(legacyName, clearSessionOptions);
  }
  res.clearCookie(GOOGLE_PENDING_VERIFY_COOKIE, cookieClearOptions(pendingVerifyCookieOptions(req)));
  res.redirect("/");
}

function createOAuthState() {
  return randomBytes(24).toString("hex");
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/google", (req, res) => {
    const credentials = getGoogleOAuthCredentials();

    if (!credentials) {
      redirectWithError(res, "Login com Google nao configurado no servidor.");
      return;
    }

    const { clientId } = credentials;

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

      if (!code || !state || !stateCookie || state !== stateCookie) {
        console.warn(`[OAuth] State mismatch — state: ${state}, cookie: ${stateCookie}`);
        redirectWithError(res, "Falha de seguranca no login Google. Tente novamente.");
        return;
      }

      const credentials = getGoogleOAuthCredentials();
      if (!credentials) {
        redirectWithError(res, "Login com Google nao configurado no servidor.");
        return;
      }

      const { clientId, clientSecret } = credentials;

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

      res.clearCookie(GOOGLE_STATE_COOKIE, cookieClearOptions(cookieOptions));
      try {
        await issueGoogleVerificationChallenge(req, res, {
          openId: sessionOpenId,
          name,
          email,
        });
      } catch (verificationError) {
        const errMsg = verificationError instanceof Error ? verificationError.message : String(verificationError);
        console.warn(`[OAuth] Email verification unavailable, using direct login fallback: ${errMsg}`);
        await finalizeLoginSession(req, res, {
          openId: sessionOpenId,
          name,
        });
      }
      return;
    } catch (error) {
      const oauthProviderError =
        axios.isAxiosError(error) && typeof error.response?.data === "object"
          ? String((error.response?.data as { error?: string }).error || "")
          : "";

      if (oauthProviderError === "invalid_client") {
        console.error("[OAuth] Google callback failed: invalid_client");
        res.clearCookie(GOOGLE_STATE_COOKIE, cookieClearOptions(cookieOptions));
        redirectWithError(res, "Configuracao OAuth invalida no servidor. Contate o suporte.");
        return;
      }

      const axiosData = axios.isAxiosError(error) ? JSON.stringify(error.response?.data) : "";
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[OAuth] Google callback failed: ${errMsg} | axiosData: ${axiosData}`);
      res.clearCookie(GOOGLE_STATE_COOKIE, cookieClearOptions(cookieOptions));
      redirectWithError(res, "Falha ao entrar com Google. Tente novamente.");
    }
  });

  app.post("/api/oauth/google/verify-code", async (req, res) => {
    const pendingToken = getCookieValue(req, GOOGLE_PENDING_VERIFY_COOKIE);
    const pending = await verifyPendingVerifyToken(pendingToken);
    if (!pending) {
      res.status(401).json({ message: "Sessao de verificacao expirada. Tente entrar novamente com Google." });
      return;
    }

    const rawCode = String(req.body?.code || "").replace(/\D/g, "");
    if (rawCode.length !== 6) {
      res.status(400).json({ message: "Informe um codigo de 6 digitos." });
      return;
    }

    const user = await getUserByOpenId(pending.openId);
    if (!user?.id) {
      res.status(401).json({ message: "Usuario invalido para verificacao." });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(500).json({ message: "Banco indisponivel no momento." });
      return;
    }

    const [rows] = await db.execute(sql`
      SELECT id, codeHash, expiresAt, attempts, maxAttempts
      FROM email_verification_codes
      WHERE userId = ${user.id}
        AND email = ${pending.email}
        AND purpose = 'google_login'
        AND consumedAt IS NULL
      ORDER BY id DESC
      LIMIT 1
    `) as any;

    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      res.status(400).json({ message: "Codigo nao encontrado. Solicite um novo codigo." });
      return;
    }

    const expiresAt = new Date(row.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      res.status(400).json({ message: "Codigo expirado. Solicite um novo codigo." });
      return;
    }

    const attempts = Number(row.attempts || 0);
    const maxAttempts = Number(row.maxAttempts || VERIFY_MAX_ATTEMPTS);
    if (attempts >= maxAttempts) {
      res.status(429).json({ message: "Numero maximo de tentativas excedido. Solicite um novo codigo." });
      return;
    }

    const valid = await bcrypt.compare(rawCode, String(row.codeHash || ""));
    if (!valid) {
      await db.execute(sql`
        UPDATE email_verification_codes
        SET attempts = attempts + 1
        WHERE id = ${Number(row.id)}
      `);
      res.status(400).json({ message: "Codigo invalido." });
      return;
    }

    await db.execute(sql`
      UPDATE email_verification_codes
      SET consumedAt = ${new Date()}
      WHERE id = ${Number(row.id)}
    `);

    const token = await sdk.createSessionToken(pending.openId, { name: pending.name });
    const sessionCookieOptions = getSessionCookieOptions(req);
    const clearSessionOptions = getSessionCookieClearOptions(req);
    res.cookie(COOKIE_NAME, token, sessionCookieOptions);
    for (const legacyName of LEGACY_COOKIE_NAMES) {
      res.clearCookie(legacyName, clearSessionOptions);
    }
    res.clearCookie(GOOGLE_PENDING_VERIFY_COOKIE, cookieClearOptions(pendingVerifyCookieOptions(req)));
    res.status(200).json({ ok: true });
  });

  app.post("/api/oauth/google/resend-code", async (req, res) => {
    const pendingToken = getCookieValue(req, GOOGLE_PENDING_VERIFY_COOKIE);
    const pending = await verifyPendingVerifyToken(pendingToken);
    if (!pending) {
      res.status(401).json({ message: "Sessao de verificacao expirada. Entre novamente com Google." });
      return;
    }

    const user = await getUserByOpenId(pending.openId);
    if (!user?.id) {
      res.status(401).json({ message: "Usuario invalido para reenvio." });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(500).json({ message: "Banco indisponivel no momento." });
      return;
    }

    const [rows] = await db.execute(sql`
      SELECT id, createdAt
      FROM email_verification_codes
      WHERE userId = ${user.id}
        AND email = ${pending.email}
        AND purpose = 'google_login'
        AND consumedAt IS NULL
      ORDER BY id DESC
      LIMIT 1
    `) as any;

    const row = Array.isArray(rows) ? rows[0] : null;
    const lastSentAt = row?.createdAt ? new Date(row.createdAt).getTime() : 0;
    if (Number.isFinite(lastSentAt) && Date.now() - lastSentAt < VERIFY_RESEND_COOLDOWN_MS) {
      const remainingSec = Math.ceil((VERIFY_RESEND_COOLDOWN_MS - (Date.now() - lastSentAt)) / 1000);
      res.status(429).json({ message: `Aguarde ${remainingSec}s para reenviar.` });
      return;
    }

    const code = buildVerificationCode();
    await persistVerificationCode({ userId: user.id, email: pending.email, code });
    await sendVerificationEmail({ to: pending.email, code, maskedEmail: maskEmail(pending.email) });
    res.status(200).json({ ok: true });
  });
}
