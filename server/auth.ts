import bcrypt from "bcryptjs";
import { getDb, getUserByNickname } from "./db";
import { users } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import type { User } from "../drizzle/schema";
import { authCompatUserSelect } from "./userCompat";
import { isValidCpf, normalizeCpf } from "./cpf";

const SALT_ROUNDS = 10;
const PASSWORD_CODE_TTL_MS = 10 * 60 * 1000;
const PASSWORD_CODE_RESEND_COOLDOWN_MS = 30 * 1000;
const PASSWORD_CODE_MAX_ATTEMPTS = 6;
const CPF_OPTIONAL_EMAILS = new Set(["gu.antunez@gmail.com"]);

function canSkipCpfRequirementByEmail(email: string) {
  return CPF_OPTIONAL_EMAILS.has(String(email || "").trim().toLowerCase());
}

function buildVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskEmail(email: string) {
  const [localPart, domainPart = ""] = String(email || "").split("@");
  if (!localPart || !domainPart) return email;
  const visible = localPart.slice(0, 2);
  const hidden = "*".repeat(Math.max(1, localPart.length - 2));
  return `${visible}${hidden}@${domainPart}`;
}

async function sendPasswordCodeEmail(params: { to: string; code: string; maskedEmail: string }) {
  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
  const fromEmail = String(process.env.AUTH_FROM_EMAIL || "").trim();
  if (!resendApiKey || !fromEmail) {
    throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  }

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">Troca de senha</h2>
      <p>Recebemos um pedido para alterar a senha da conta <strong>${params.maskedEmail}</strong>.</p>
      <p>Use este codigo para confirmar a alteracao:</p>
      <p style="font-size: 28px; letter-spacing: 6px; font-weight: 700; margin: 16px 0;">${params.code}</p>
      <p>Este codigo expira em 10 minutos.</p>
      <p>Se voce nao solicitou essa troca, ignore este e-mail.</p>
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
      subject: "Codigo para trocar senha - All in Edge",
      html,
      text: `Seu codigo para trocar senha: ${params.code}. Expira em 10 minutos.`,
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`EMAIL_PROVIDER_ERROR: ${response.status} ${raw}`);
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function registerUser(params: {
  name: string;
  email: string;
  password: string;
  country?: string;
  stateRegion?: string;
  city?: string;
  addressLine?: string;
  postalCode?: string;
  taxDocument?: string;
}): Promise<User> {
  const name = params.name.trim().replace(/\s+/g, " ");
  const email = params.email.trim().toLowerCase();
  const { password } = params;
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");

  // Check if email already exists
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const existingNickname = await getUserByNickname(name);
  if (existingNickname) {
    throw new Error("NICKNAME_ALREADY_EXISTS");
  }

  let normalizedTaxDocument: string | null = null;
  if (params.taxDocument?.trim()) {
    const candidate = normalizeCpf(params.taxDocument);
    if (!isValidCpf(candidate)) {
      throw new Error("CPF_INVALID");
    }

    const existingCpfRows = await db
      .select({ id: users.id, taxDocument: users.taxDocument })
      .from(users)
      .where(sql`${users.taxDocument} is not null`);

    const cpfTaken = existingCpfRows.some((row) => normalizeCpf(String(row.taxDocument || "")) === candidate);
    if (cpfTaken) {
      throw new Error("CPF_ALREADY_EXISTS");
    }

    normalizedTaxDocument = candidate;
  }

  const passwordHash = await hashPassword(password);
  const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();

  await db.insert(users).values({
    openId,
    name,
    email,
    passwordHash,
    loginMethod: "email",
    inviteCode,
    country: params.country?.trim() ? params.country.trim().slice(0, 120) : null,
    stateRegion: params.stateRegion?.trim() ? params.stateRegion.trim().slice(0, 120) : null,
    city: params.city?.trim() ? params.city.trim().slice(0, 120) : null,
    addressLine: params.addressLine?.trim() ? params.addressLine.trim().slice(0, 300) : null,
    postalCode: params.postalCode?.trim() ? params.postalCode.trim().slice(0, 20) : null,
    taxDocument: normalizedTaxDocument,
    locationConsentAt: params.country?.trim() && params.city?.trim() ? new Date() : null,
    lastSignedIn: new Date(),
  });

  const user = await db
    .select(authCompatUserSelect)
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return user[0] as User;
}

export async function loginUser(params: {
  identifier: string;
  password: string;
}): Promise<{ user: User; token: string }> {
  const { identifier, password } = params;
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");

  const normalizedIdentifier = identifier.trim();
  const normalizedCpf = normalizeCpf(normalizedIdentifier);

  const result = await db
    .select(authCompatUserSelect)
    .from(users)
    .where(normalizedIdentifier.includes("@")
      ? eq(users.email, normalizedIdentifier.toLowerCase())
      : sql`${users.taxDocument} = ${normalizedCpf}`)
    .limit(1);
  if (result.length === 0) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const user = result[0];

  // Conta antiga sem senha — retornar erro especial para o frontend tratar
  if (!user.passwordHash) {
    throw new Error("NEEDS_PASSWORD_SETUP");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new Error("INVALID_CREDENTIALS");
  }

  // Update last signed in
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

  // Create session token using existing SDK
  const token = await sdk.createSessionToken(user.openId, { name: user.name || "" });

  return { user, token };
}

/**
 * Fluxo de primeiro acesso: define senha para conta antiga (sem passwordHash).
 * Verifica que o email existe e que a conta ainda não tem senha.
 */
export async function setupPasswordForExistingUser(params: {
  email: string;
  password: string;
  taxDocument?: string;
}): Promise<{ user: User; token: string }> {
  const { email, password } = params;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");

  const result = await db
    .select(authCompatUserSelect)
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (result.length === 0) {
    throw new Error("USER_NOT_FOUND");
  }

  const user = result[0];

  // Segurança: só permite setup se a conta ainda não tiver senha
  if (user.passwordHash) {
    throw new Error("PASSWORD_ALREADY_SET");
  }

  const currentTaxDocument = user.taxDocument ? normalizeCpf(String(user.taxDocument)) : null;
  let normalizedTaxDocument = currentTaxDocument;
  if (params.taxDocument?.trim()) {
    const candidate = normalizeCpf(params.taxDocument);
    if (!isValidCpf(candidate)) {
      throw new Error("CPF_INVALID");
    }

    const existingCpfRows = await db
      .select({ id: users.id, taxDocument: users.taxDocument })
      .from(users)
      .where(sql`${users.taxDocument} is not null`);

    const cpfTaken = existingCpfRows.some((row) => normalizeCpf(String(row.taxDocument || "")) === candidate && row.id !== user.id);
    if (cpfTaken) {
      throw new Error("CPF_ALREADY_EXISTS");
    }

    if (currentTaxDocument && currentTaxDocument !== candidate) {
      throw new Error("CPF_MISMATCH");
    }

    normalizedTaxDocument = candidate;
  }

  if (!normalizedTaxDocument && !canSkipCpfRequirementByEmail(normalizedEmail)) {
    throw new Error("CPF_REQUIRED");
  }

  const passwordHash = await hashPassword(password);

  await db.update(users)
    .set({
      passwordHash,
      loginMethod: user.loginMethod || "email",
      taxDocument: normalizedTaxDocument,
      lastSignedIn: new Date(),
    })
    .where(eq(users.id, user.id));

  // Buscar usuário atualizado
  const updated = await db
    .select(authCompatUserSelect)
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const updatedUser = updated[0] as User;

  const token = await sdk.createSessionToken(updatedUser.openId, { name: updatedUser.name || "" });
  return { user: updatedUser, token };
}

export async function sendPasswordChangeCodeForUser(userId: number): Promise<{ maskedEmail: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");

  const rows = await db
    .select(authCompatUserSelect)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (rows.length === 0) throw new Error("USER_NOT_FOUND");

  const user = rows[0] as User;
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) throw new Error("USER_HAS_NO_EMAIL");

  const [recentRows] = await db.execute(sql`
    SELECT id, createdAt
    FROM email_verification_codes
    WHERE userId = ${userId}
      AND email = ${email}
      AND purpose = 'password_change'
      AND consumedAt IS NULL
    ORDER BY id DESC
    LIMIT 1
  `) as any;

  const recent = Array.isArray(recentRows) ? recentRows[0] : null;
  const lastSentAt = recent?.createdAt ? new Date(recent.createdAt).getTime() : 0;
  if (Number.isFinite(lastSentAt) && Date.now() - lastSentAt < PASSWORD_CODE_RESEND_COOLDOWN_MS) {
    throw new Error("CODE_RESEND_TOO_SOON");
  }

  const code = buildVerificationCode();
  const codeHash = await hashPassword(code);
  await db.execute(sql`
    INSERT INTO email_verification_codes (userId, email, purpose, codeHash, expiresAt, maxAttempts)
    VALUES (${userId}, ${email}, 'password_change', ${codeHash}, ${new Date(Date.now() + PASSWORD_CODE_TTL_MS)}, ${PASSWORD_CODE_MAX_ATTEMPTS})
  `);

  await sendPasswordCodeEmail({
    to: email,
    code,
    maskedEmail: maskEmail(email),
  });

  return { maskedEmail: maskEmail(email) };
}

export async function changePasswordWithCode(params: {
  userId: number;
  code: string;
  newPassword: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");

  const rows = await db
    .select(authCompatUserSelect)
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);
  if (rows.length === 0) throw new Error("USER_NOT_FOUND");

  const user = rows[0] as User;
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) throw new Error("USER_HAS_NO_EMAIL");

  const [codeRows] = await db.execute(sql`
    SELECT id, codeHash, expiresAt, attempts, maxAttempts
    FROM email_verification_codes
    WHERE userId = ${params.userId}
      AND email = ${email}
      AND purpose = 'password_change'
      AND consumedAt IS NULL
    ORDER BY id DESC
    LIMIT 1
  `) as any;

  const latest = Array.isArray(codeRows) ? codeRows[0] : null;
  if (!latest) throw new Error("CODE_NOT_FOUND");

  const expiresAt = new Date(latest.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    throw new Error("CODE_EXPIRED");
  }

  const attempts = Number(latest.attempts || 0);
  const maxAttempts = Number(latest.maxAttempts || PASSWORD_CODE_MAX_ATTEMPTS);
  if (attempts >= maxAttempts) {
    throw new Error("CODE_MAX_ATTEMPTS");
  }

  const isValid = await verifyPassword(params.code, String(latest.codeHash || ""));
  if (!isValid) {
    await db.execute(sql`
      UPDATE email_verification_codes
      SET attempts = attempts + 1
      WHERE id = ${Number(latest.id)}
    `);
    throw new Error("CODE_INVALID");
  }

  const passwordHash = await hashPassword(params.newPassword);
  await db.update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, params.userId));

  await db.execute(sql`
    UPDATE email_verification_codes
    SET consumedAt = ${new Date()}
    WHERE id = ${Number(latest.id)}
  `);
}
