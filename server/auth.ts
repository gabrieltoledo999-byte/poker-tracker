import bcrypt from "bcryptjs";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import type { User } from "../drizzle/schema";

const SALT_ROUNDS = 10;

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
}): Promise<User> {
  const { name, email, password } = params;
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");

  // Check if email already exists
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw new Error("EMAIL_ALREADY_EXISTS");
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
    lastSignedIn: new Date(),
  });

  const user = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return user[0];
}

export async function loginUser(params: {
  email: string;
  password: string;
}): Promise<{ user: User; token: string }> {
  const { email, password } = params;
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
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
}): Promise<{ user: User; token: string }> {
  const { email, password } = params;
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (result.length === 0) {
    throw new Error("USER_NOT_FOUND");
  }

  const user = result[0];

  // Segurança: só permite setup se a conta ainda não tiver senha
  if (user.passwordHash) {
    throw new Error("PASSWORD_ALREADY_SET");
  }

  const passwordHash = await hashPassword(password);

  await db.update(users)
    .set({ passwordHash, loginMethod: "email", lastSignedIn: new Date() })
    .where(eq(users.id, user.id));

  // Buscar usuário atualizado
  const updated = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const updatedUser = updated[0];

  const token = await sdk.createSessionToken(updatedUser.openId, { name: updatedUser.name || "" });
  return { user: updatedUser, token };
}
