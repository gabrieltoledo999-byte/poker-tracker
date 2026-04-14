import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { asc } from "drizzle-orm";
import type { User } from "../../drizzle/schema";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { authCompatUserSelect } from "../userCompat";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function isLocalDevelopmentRequest(req: CreateExpressContextOptions["req"]): boolean {
  if (process.env.NODE_ENV !== "development") return false;

  const forwardedHost = req.headers["x-forwarded-host"];
  const hostHeader = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost ?? req.headers.host ?? "";
  const hostname = String(hostHeader).split(":")[0].toLowerCase();

  return hostname === "localhost" || hostname === "127.0.0.1";
}

async function getLocalDevelopmentUser(): Promise<User | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const result = await db
      .select(authCompatUserSelect)
      .from(users)
      .orderBy(asc(users.id))
      .limit(1);

    return (result[0] as User | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (!user && isLocalDevelopmentRequest(opts.req)) {
    user = await getLocalDevelopmentUser();
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
