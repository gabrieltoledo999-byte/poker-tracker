import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getLeaderboard, getFriends, searchUsersToAdd, getPublicFeed, createPost, deletePost, toggleLike, getPostComments, createComment, deleteComment, togglePostReaction, sendFriendRequest, sendFriendRequestByNickname, getIncomingFriendRequests, getOutgoingFriendRequests, respondToFriendRequest, cancelFriendRequest, removeFriendship, blockUser, resetFriendshipNetworkForUser, resetFriendshipNetworkGlobally, sendMessage, getConversation, getConversationList, markConversationRead, getUnreadCount, toggleMessageReaction } from "./db";
import { z } from "zod";
import {
  createSession,
  updateSession,
  deleteSession,
  getSessionById,
  getUserSessions,
  getSessionStats,
  getStatsByGameFormat,
  getBankrollSettings,
  upsertBankrollSettings,
  getBankrollHistory,
  createVenue,
  updateVenue,
  deleteVenue,
  getUserVenues,
  getVenueById,
  initializePresetVenues,
  getStatsByVenue,
  createInvite,
  getInviteByCode,
  acceptInvite,
  getUserInvites,
  getInviteRanking,
  getUserById,
  updateUserPreferredPlayType,
  updateUserOnboardingProfile,
  getUserOnboardingProfile,
  updateUserAvatar,
  getUserInviteCode,
  getUserByInviteCode,
  createFundTransaction,
  getUserFundTransactions,
  deleteFundTransaction,
  getFundTransactionsTotals,
  updateVenueBalance,
  getVenueBalanceHistory,
  getUserPreferences,
  startActiveSession,
  getActiveSession,
  getActiveSessionTables,
  addSessionTable,
  updateSessionTable,
  removeSessionTable,
  finalizeActiveSession,
  discardActiveSession,
  getSessionTables,
  getRecentPlayedTables,
  getHandPatternStats,
  getGlobalHandPatternStats,
  registerHandPatternResult,
  updateHandPatternManualStats,
} from "./db";
import { getUsdToBrlRate, convertUsdToBrl, convertToBrl, getAllRates, refreshRates, getCadToBrlRate } from "./currency";
import { PRESET_VENUES } from "@shared/presetVenues";
import { registerUser, loginUser, setupPasswordForExistingUser } from "./auth";

// Game format enum for validation
const gameFormatEnum = z.enum([
  "cash_game",
  "tournament",
  "turbo",
  "hyper_turbo",
  "sit_and_go",
  "spin_and_go",
  "bounty",
  "satellite",
  "freeroll",
  "home_game",
]);

// Currency enum
const currencyEnum = z.enum(["BRL", "USD", "CAD", "JPY", "CNY"]);

const onboardingProfileInput = z.object({
  preferredPlayType: z.enum(["online", "live"]),
  preferredPlatforms: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  preferredFormats: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  preferredBuyIns: z.array(z.number().int().positive()).max(12).optional(),
  preferredBuyInsOnline: z.array(z.number().int().positive()).max(12).optional(),
  preferredBuyInsLive: z.array(z.number().int().positive()).max(12).optional(),
  playsMultiPlatform: z.boolean().optional(),
  showInGlobalRanking: z.boolean().optional(),
  showInFriendsRanking: z.boolean().optional(),
});

function isAcceptedAvatarUrl(value: string): boolean {
  const avatarUrl = value.trim();
  if (!avatarUrl) return false;
  if (avatarUrl.startsWith("/avatars/")) return true;
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(avatarUrl)) return true;

  try {
    const parsed = new URL(avatarUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

type ImportType = "online" | "live";
type ImportCurrency = "BRL" | "USD" | "CAD" | "JPY" | "CNY";
type ImportFormat = z.infer<typeof gameFormatEnum>;
const importCurrencyModeEnum = z.enum(["auto", "BRL", "USD", "CAD", "JPY", "CNY"]);

type ParsedImportItem = {
  sourceText: string;
  type: ImportType;
  gameFormat: ImportFormat;
  currency: ImportCurrency;
  buyIn: number;
  cashOut: number;
  durationMinutes: number;
  sessionDate: Date;
  venueName?: string;
  gameType?: string;
  stakes?: string;
  clubName?: string;
  notes?: string;
  warnings: string[];
};

function normalizeVenueName(name?: string): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseDateFromText(text: string): Date | null {
  const iso = text.match(/\b(\d{4})[-\/](\d{2})[-\/](\d{2})\b/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const br = text.match(/\b(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\b/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12, 0, 0, 0);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

function parseDurationMinutes(text: string): number {
  const hm = text.match(/(\d+)\s*h(?:oras?)?\s*(\d+)?\s*m?/i);
  if (hm) {
    const hours = Number(hm[1] ?? 0);
    const mins = Number(hm[2] ?? 0);
    return Math.max(1, hours * 60 + mins);
  }
  const onlyMin = text.match(/(\d+)\s*(?:min|mins|minutos?)\b/i);
  if (onlyMin) {
    return Math.max(1, Number(onlyMin[1]));
  }
  return 120;
}

function detectType(text: string): ImportType {
  if (/\b(live|presencial|cassino|clube)\b/i.test(text)) return "live";
  return "online";
}

function detectFormat(text: string): ImportFormat {
  const t = text.toLowerCase();
  if (/\b(torneio|tournament|mtt)\b/i.test(t)) return "tournament";
  if (/\b(cash\s*game|cashgame|cash_game|ring\s*game)\b/i.test(t)) return "cash_game";
  if (t.includes("sit") || t.includes("sng")) return "sit_and_go";
  if (t.includes("spin")) return "spin_and_go";
  if (t.includes("hyper")) return "hyper_turbo";
  if (t.includes("turbo")) return "turbo";
  if (t.includes("bounty") || t.includes("pko")) return "bounty";
  if (t.includes("satelite") || t.includes("satélite") || t.includes("satellite")) return "satellite";
  if (t.includes("freeroll")) return "freeroll";
  if (t.includes("home game") || t.includes("homegame")) return "home_game";
  return "tournament";
}

function detectCurrency(text: string): ImportCurrency {
  if (/\b(CA\$|CAD)\b/i.test(text)) return "CAD";
  if (/\b(CN¥|CNY|RMB)\b/i.test(text)) return "CNY";
  if (/\b(¥|JPY)\b/i.test(text)) return "JPY";
  if (/\b(US\$|USD|\$)\b/i.test(text)) return "USD";
  return "BRL";
}

function parseMoneyValue(raw: string): number | null {
  const cleaned = raw
    .replace(/[R$US$CA$CN¥¥\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

function parseBuyInAndCashOut(text: string): { buyIn: number | null; cashOut: number | null } {
  const buyInLabel = text.match(/(?:buy\s*-?in|entrada|inscri[cç][aã]o)\s*[:=]?\s*([\w$.,]+)/i);
  const cashOutLabel = text.match(/(?:cash\s*-?out|saida|sa[ií]da|premio|pr[eê]mio|resultado)\s*[:=]?\s*([\w$.,-]+)/i);

  const buyIn = buyInLabel ? parseMoneyValue(buyInLabel[1]) : null;
  const cashOut = cashOutLabel ? parseMoneyValue(cashOutLabel[1]) : null;

  if (buyIn !== null || cashOut !== null) return { buyIn, cashOut };

  const numbers = Array.from(text.matchAll(/(?:R\$|US\$|CA\$|CN¥|¥|\$)?\s*(\d+[\d.,]*)/g));
  const first = numbers[0]?.[1] ? parseMoneyValue(numbers[0][1]) : null;
  const second = numbers[1]?.[1] ? parseMoneyValue(numbers[1][1]) : null;
  return { buyIn: first, cashOut: second };
}

function parseVenueName(text: string): string | undefined {
  const canonicalize = (raw?: string): string | undefined => {
    if (!raw) return undefined;
    const normalizedRaw = normalizeVenueName(raw);
    if (!normalizedRaw) return undefined;
    if (normalizedRaw.includes("pppoker") || normalizedRaw.includes("pp poker")) return "PP Poker";
    if (normalizedRaw.includes("ggpoker") || normalizedRaw.includes("gg poker")) return "GG Poker";
    if (normalizedRaw.includes("suprema")) return "Suprema Poker";
    if (normalizedRaw.includes("pokerstars")) return "PokerStars";
    if (normalizedRaw.includes("pokerbros")) return "PokerBros";
    if (normalizedRaw.includes("wpt global")) return "WPT Global";
    if (normalizedRaw.includes("888poker")) return "888poker";
    if (normalizedRaw.includes("kkpoker")) return "KKPoker";
    if (normalizedRaw.includes("x-poker") || normalizedRaw.includes("xpoker")) return "X-Poker";
    return raw.trim();
  };

  const byLabel = text.match(/(?:plataforma|site|local|venue)\s*[:=]\s*([^;|,\n]+)/i);
  if (byLabel?.[1]) return canonicalize(byLabel[1]);

  const known = [
    "pp poker",
    "pppoker",
    "suprema",
    "gg poker",
    "ggpoker",
    "pokerstars",
    "pokerbros",
    "wpt global",
    "888poker",
    "kkpoker",
    "x-poker",
  ];
  const normalized = normalizeVenueName(text);
  const hit = known.find((name) => normalized.includes(name));
  if (!hit) return undefined;
  return canonicalize(hit);
}

function parseImportText(rawText: string, forcedCurrency?: ImportCurrency): ParsedImportItem[] {
  const chunks = rawText
    .split(/\n\s*\n|\n(?=\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})|\n(?=\d{4}[\/\-]\d{2}[\/\-]\d{2})/)
    .map((part) => part.trim())
    .filter(Boolean);

  const entries = (chunks.length > 0 ? chunks : rawText.split("\n")).map((line) => line.trim()).filter(Boolean);

  return entries.map((entry) => {
    const warnings: string[] = [];
    const type = detectType(entry);
    const gameFormat = detectFormat(entry);
    const currency = forcedCurrency ?? detectCurrency(entry);
    const durationMinutes = parseDurationMinutes(entry);
    const sessionDate = parseDateFromText(entry) ?? new Date();
    const venueName = parseVenueName(entry);
    const values = parseBuyInAndCashOut(entry);

    if (!values.buyIn || values.buyIn < 0) warnings.push("Buy-in não identificado com precisão. Revise antes de importar.");
    if (values.cashOut === null) warnings.push("Cash-out não identificado. Será usado 0 por padrão.");
    if (!venueName) warnings.push("Plataforma/local não identificado. Esta linha não será importada.");

    return {
      sourceText: entry,
      type,
      gameFormat,
      currency,
      buyIn: values.buyIn ?? 0,
      cashOut: values.cashOut ?? 0,
      durationMinutes,
      sessionDate,
      venueName,
      notes: entry.slice(0, 1200),
      warnings,
    };
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    register: publicProcedure
      .input(z.object({
        name: z.string().min(2).max(100),
        email: z.string().email(),
        password: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const user = await registerUser(input);
          const { token } = await loginUser({ email: input.email, password: input.password });
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
          return { success: true, user };
        } catch (err: any) {
          console.error("[auth.register] failed:", err);
          if (err.message === "EMAIL_ALREADY_EXISTS") {
            throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já está cadastrado." });
          }
          if (err.message === "NICKNAME_ALREADY_EXISTS") {
            throw new TRPCError({ code: "CONFLICT", message: "Este nickname já está em uso." });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar conta. Tente novamente." });
        }
      }),
    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const { user, token } = await loginUser(input);
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
          return { success: true, user, needsPasswordSetup: false };
        } catch (err: any) {
          console.error("[auth.login] failed:", err);
          if (err.message === "NEEDS_PASSWORD_SETUP") {
            return { success: false, needsPasswordSetup: true, user: null, token: null };
          }
          if (err.message === "INVALID_CREDENTIALS") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha incorretos." });
          }
          if (err.message === "DB_UNAVAILABLE") {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Serviço temporariamente indisponível." });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao fazer login. Tente novamente." });
        }
      }),
    // Fluxo de primeiro acesso: define senha para conta antiga sem senha
    setupPassword: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const { user, token } = await setupPasswordForExistingUser(input);
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, token, cookieOptions);
          return { success: true, user };
        } catch (err: any) {
          console.error("[auth.setupPassword] failed:", err);
          if (err.message === "USER_NOT_FOUND") {
            throw new TRPCError({ code: "NOT_FOUND", message: "E-mail não encontrado." });
          }
          if (err.message === "PASSWORD_ALREADY_SET") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Esta conta já possui senha. Use o login normal." });
          }
          if (err.message === "DB_UNAVAILABLE") {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Serviço temporariamente indisponível." });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao configurar senha. Tente novamente." });
        }
      }),
  }),

  // Sessions router
  sessions: router({
    // Create a new session
    create: protectedProcedure
      .input(z.object({
        type: z.enum(["online", "live"]),
        gameFormat: gameFormatEnum,
        currency: currencyEnum.default("BRL"),
        buyIn: z.number().int().positive(), // in original currency centavos
        cashOut: z.number().int().min(0), // in original currency centavos
        sessionDate: z.date(),
        durationMinutes: z.number().int().positive(),
        notes: z.string().optional(),
        doubts: z.string().optional(),
        venueId: z.number().int().optional(),
        gameType: z.string().optional(),
        stakes: z.string().optional(),
        location: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        let buyInBrl = input.buyIn;
        let cashOutBrl = input.cashOut;
        let exchangeRate: number | null = null;
        let originalBuyIn: number | null = null;
        let originalCashOut: number | null = null;

        // Convert non-BRL values to BRL when persisting finalized sessions
        if (input.currency !== "BRL") {
          const rates = await getAllRates();
          const rate = rates[input.currency as "USD" | "CAD" | "JPY" | "CNY"]?.rate;
          if (!rate) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Cotação indisponível para ${input.currency}.` });
          }
          exchangeRate = Math.round(rate * 10000);
          originalBuyIn = input.buyIn;
          originalCashOut = input.cashOut;
          buyInBrl = await convertToBrl(input.buyIn, input.currency);
          cashOutBrl = await convertToBrl(input.cashOut, input.currency);
        }

        return await createSession({
          userId: ctx.user.id,
          type: input.type,
          gameFormat: input.gameFormat,
          currency: input.currency,
          buyIn: buyInBrl,
          cashOut: cashOutBrl,
          originalBuyIn,
          originalCashOut,
          exchangeRate,
          sessionDate: input.sessionDate,
          durationMinutes: input.durationMinutes,
          notes: input.notes,
          doubts: input.doubts,
          venueId: input.venueId,
          gameType: input.gameType,
          stakes: input.stakes,
          location: input.location,
        });
      }),

    // Update a session
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        type: z.enum(["online", "live"]).optional(),
        gameFormat: gameFormatEnum.optional(),
        currency: currencyEnum.optional(),
        buyIn: z.number().int().positive().optional(),
        cashOut: z.number().int().min(0).optional(),
        sessionDate: z.date().optional(),
        durationMinutes: z.number().int().positive().optional(),
        notes: z.string().optional(),
        doubts: z.string().optional(),
        venueId: z.number().int().optional(),
        gameType: z.string().optional(),
        stakes: z.string().optional(),
        location: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        
        // If currency is being changed and values are provided, convert to BRL storage
        if (data.currency && data.currency !== "BRL" && (data.buyIn || data.cashOut !== undefined)) {
          const rates = await getAllRates();
          const rate = rates[data.currency as "USD" | "CAD" | "JPY" | "CNY"]?.rate;
          if (!rate) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Cotação indisponível para ${data.currency}.` });
          }
          const exchangeRate = Math.round(rate * 10000);
          
          if (data.buyIn) {
            (data as any).originalBuyIn = data.buyIn;
            data.buyIn = await convertToBrl(data.buyIn, data.currency);
          }
          if (data.cashOut !== undefined) {
            (data as any).originalCashOut = data.cashOut;
            data.cashOut = await convertToBrl(data.cashOut, data.currency);
          }
          (data as any).exchangeRate = exchangeRate;
        }
        
        return await updateSession(id, ctx.user.id, data);
      }),

    // Delete a session
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return await deleteSession(input.id, ctx.user.id);
      }),

    // Get a single session
    get: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ ctx, input }) => {
        return await getSessionById(input.id, ctx.user.id);
      }),

    // List sessions with filters
    list: protectedProcedure
      .input(z.object({
        type: z.enum(["online", "live"]).optional(),
        gameFormat: gameFormatEnum.optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        orderBy: z.enum(["date", "profit", "duration"]).optional(),
        orderDir: z.enum(["asc", "desc"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return await getUserSessions(ctx.user.id, input);
      }),

    // Get session statistics
    stats: protectedProcedure
      .input(z.object({
        type: z.enum(["online", "live"]).optional(),
        gameFormat: gameFormatEnum.optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return await getSessionStats(ctx.user.id, input?.type, input?.gameFormat);
      }),

     // Get statistics grouped by game format
    statsByFormat: protectedProcedure
      .query(async ({ ctx }) => {
        return await getStatsByGameFormat(ctx.user.id);
      }),
    // Get user preferences based on session history (smart suggestions)
    getUserPreferences: protectedProcedure
      .query(async ({ ctx }) => {
        return await getUserPreferences(ctx.user.id);
      }),

    // Save onboarding answer used to bootstrap smart defaults before enough history exists
    saveInitialPlayStyle: protectedProcedure
      .input(z.object({ preferredPlayType: z.enum(["online", "live"]) }))
      .mutation(async ({ ctx, input }) => {
        await updateUserPreferredPlayType(ctx.user.id, input.preferredPlayType);
        return await getUserPreferences(ctx.user.id);
      }),

    getOnboardingProfile: protectedProcedure
      .query(async ({ ctx }) => {
        return await getUserOnboardingProfile(ctx.user.id);
      }),

    saveOnboardingProfile: protectedProcedure
      .input(onboardingProfileInput)
      .mutation(async ({ ctx, input }) => {
        await updateUserOnboardingProfile(ctx.user.id, input);
        return await getUserPreferences(ctx.user.id);
      }),

    importPreview: protectedProcedure
      .input(z.object({ rawText: z.string().min(10).max(120000), currencyMode: importCurrencyModeEnum.optional() }))
      .mutation(async ({ input }) => {
        const forcedCurrency = input.currencyMode && input.currencyMode !== "auto" ? input.currencyMode : undefined;
        const parsed = parseImportText(input.rawText, forcedCurrency);
        const warnings = parsed.flatMap((item, idx) => item.warnings.map((w) => `Linha ${idx + 1}: ${w}`));
        return {
          totalDetected: parsed.length,
          readyToImport: parsed.filter((p) => p.buyIn >= 0).length,
          warnings,
          items: parsed.map((item) => ({
            sourceText: item.sourceText,
            type: item.type,
            gameFormat: item.gameFormat,
            currency: item.currency,
            buyIn: item.buyIn,
            cashOut: item.cashOut,
            durationMinutes: item.durationMinutes,
            sessionDate: item.sessionDate,
            venueName: item.venueName ?? "Não mapeado",
            warnings: item.warnings,
          })),
        };
      }),

    importFromText: protectedProcedure
      .input(z.object({ rawText: z.string().min(10).max(120000), currencyMode: importCurrencyModeEnum.optional() }))
      .mutation(async ({ ctx, input }) => {
        await initializePresetVenues(ctx.user.id, PRESET_VENUES);

        const forcedCurrency = input.currencyMode && input.currencyMode !== "auto" ? input.currencyMode : undefined;
        const parsed = parseImportText(input.rawText, forcedCurrency);
        if (parsed.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum dado identificável para importar." });
        }

        const allVenues = await getUserVenues(ctx.user.id);
        const venueMap = new Map(allVenues.map((v) => [normalizeVenueName(v.name), v]));

        const rates = await getAllRates();
        let imported = 0;
        const failures: string[] = [];

        for (let i = 0; i < parsed.length; i++) {
          const item = parsed[i];
          try {
            const venueName = item.venueName?.trim();
            if (!venueName) {
              throw new Error("plataforma/local não identificado. Ajuste o texto para uma plataforma existente");
            }
            const normalizedVenue = normalizeVenueName(venueName);
            let venue = venueMap.get(normalizedVenue);
            if (!venue) {
              const fallback = Array.from(venueMap.entries()).find(([key]) =>
                key.includes(normalizedVenue) || normalizedVenue.includes(key)
              );
              if (fallback) {
                venue = fallback[1];
              }
            }
            if (!venue) {
              throw new Error(`plataforma '${venueName}' não existe. Cadastre/ative essa plataforma antes de importar`);
            }

            let buyInBrl = item.buyIn;
            let cashOutBrl = item.cashOut;
            let exchangeRate: number | null = null;
            let originalBuyIn: number | null = null;
            let originalCashOut: number | null = null;

            if (item.currency !== "BRL") {
              const rate = rates[item.currency as "USD" | "CAD" | "JPY" | "CNY"]?.rate;
              if (!rate) {
                throw new Error(`Cotação indisponível para ${item.currency}`);
              }
              exchangeRate = Math.round(rate * 10000);
              originalBuyIn = item.buyIn;
              originalCashOut = item.cashOut;
              buyInBrl = await convertToBrl(item.buyIn, item.currency);
              cashOutBrl = await convertToBrl(item.cashOut, item.currency);
            }

            const createdSession = await createSession({
              userId: ctx.user.id,
              type: item.type,
              gameFormat: item.gameFormat,
              currency: item.currency,
              buyIn: buyInBrl,
              cashOut: cashOutBrl,
              originalBuyIn,
              originalCashOut,
              exchangeRate,
              sessionDate: item.sessionDate,
              durationMinutes: Math.max(1, item.durationMinutes),
              notes: item.notes,
              venueId: venue.id,
              gameType: item.gameType,
              stakes: item.stakes,
              location: null,
              doubts: null,
            } as any);

            const startedAt = new Date(item.sessionDate);
            const endedAt = new Date(startedAt.getTime() + Math.max(1, item.durationMinutes) * 60_000);
            await addSessionTable({
              userId: ctx.user.id,
              sessionId: createdSession.id,
              activeSessionId: null,
              venueId: venue.id,
              type: item.type,
              gameFormat: item.gameFormat,
              currency: item.currency,
              buyIn: item.buyIn,
              cashOut: item.cashOut,
              clubName: item.clubName,
              gameType: item.gameType,
              stakes: item.stakes,
              notes: item.notes,
              startedAt,
              endedAt,
            } as any);

            imported += 1;
          } catch (err: any) {
            failures.push(`Linha ${i + 1}: ${err?.message ?? "falha ao importar"}`);
          }
        }

        return {
          imported,
          failed: failures.length,
          failures,
          message: failures.length === 0
            ? `Importação concluída com ${imported} item(ns).`
            : `Importação parcial: ${imported} importado(s), ${failures.length} com erro.`,
        };
      }),

    // ── Active Session (timer-based) ──────────────────────────────────────
    // Start a new active session (timer begins now)
    startActive: protectedProcedure
      .input(z.object({ notes: z.string().optional() }).optional())
      .mutation(async ({ ctx, input }) => {
        return await startActiveSession(ctx.user.id, input?.notes);
      }),

    // Get current active session (null if none)
    getActive: protectedProcedure
      .query(async ({ ctx }) => {
        const active = await getActiveSession(ctx.user.id);
        if (!active) return null;
        const tables = await getActiveSessionTables(active.id, ctx.user.id);
        return { ...active, tables };
      }),

    // Add a table to the active session
    addTable: protectedProcedure
      .input(z.object({
        activeSessionId: z.number().int(),
        venueId: z.number().int().optional(),
        type: z.enum(["online", "live"]).default("online"),
        gameFormat: gameFormatEnum.default("tournament"),
        currency: z.enum(["BRL", "USD", "CAD", "JPY", "CNY"]).default("BRL"),
        buyIn: z.number().int().min(0),
        gameType: z.string().optional(),
        stakes: z.string().optional(),
        clubName: z.string().max(120).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const table = await addSessionTable({
          ...input,
          cashOut: 0,
          userId: ctx.user.id,
          startedAt: new Date(),
        });

        // Learn default currency per platform/local from the user's latest saved table.
        if (input.venueId && input.currency) {
          await updateVenue(input.venueId, ctx.user.id, { currency: input.currency as any });
        }

        return table;
      }),

    // Update a table (e.g. set cashOut when leaving)
    updateTable: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        venueId: z.number().int().optional(),
        type: z.enum(["online", "live"]).optional(),
        gameFormat: gameFormatEnum.optional(),
        currency: z.enum(["BRL", "USD", "CAD", "JPY", "CNY"]).optional(),
        buyIn: z.number().int().min(0).optional(),
        cashOut: z.number().int().min(0).optional().nullable(),
        gameType: z.string().optional(),
        stakes: z.string().optional(),
        clubName: z.string().max(120).optional(),
        notes: z.string().optional(),
        endedAt: z.date().optional().nullable(),
        incrementRebuy: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, incrementRebuy, ...data } = input;
        const updated = await updateSessionTable(id, ctx.user.id, data as any, incrementRebuy === true);

        if (data.venueId && data.currency) {
          await updateVenue(data.venueId, ctx.user.id, { currency: data.currency as any });
        }

        return updated;
      }),

    // Remove a table from the active session
    removeTable: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return await removeSessionTable(input.id, ctx.user.id);
      }),

    // Finalize the active session (creates a sessions record)
    finalize: protectedProcedure
      .input(z.object({
        activeSessionId: z.number().int(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const rates = await getAllRates();
        const exchangeRates = {
          USD: Math.round((rates?.USD?.rate ?? 5.75) * 100),
          CAD: Math.round((rates?.CAD?.rate ?? 4.20) * 100),
          JPY: Math.round((rates?.JPY?.rate ?? 0.033) * 100),
          CNY: Math.round((rates?.CNY?.rate ?? 0.80) * 100),
        };
        return await finalizeActiveSession(
          ctx.user.id,
          input.activeSessionId,
          input.notes,
          exchangeRates
        );
      }),

    // Discard the active session without saving
    discard: protectedProcedure
      .input(z.object({ activeSessionId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return await discardActiveSession(ctx.user.id, input.activeSessionId);
      }),

    // Get tables for a finalized session
    getTables: protectedProcedure
      .input(z.object({ sessionId: z.number().int() }))
      .query(async ({ ctx, input }) => {
        return await getSessionTables(input.sessionId, ctx.user.id);
      }),

    // Recent played tables (for dashboard/home)
    recentTables: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(50).optional() }).optional())
      .query(async ({ ctx, input }) => {
        return await getRecentPlayedTables(ctx.user.id, input?.limit ?? 8);
      }),

    // Hand pattern counters from table notes (KK/JJ/AA/AK)
    handPatternStats: protectedProcedure
      .query(async ({ ctx }) => {
        return await getHandPatternStats(ctx.user.id);
      }),

    // Fast increment for premium hand result on dashboard cards
    registerHandResult: protectedProcedure
      .input(z.object({ hand: z.enum(["kk", "jj", "aa", "ak"]), outcome: z.enum(["win", "loss"]) }))
      .mutation(async ({ ctx, input }) => {
        return await registerHandPatternResult(ctx.user.id, input.hand, input.outcome);
      }),

    // Full edit for premium hand counters (correction modal)
    updateHandStats: protectedProcedure
      .input(z.object({
        kk: z.object({ hands: z.number().int().min(0), wins: z.number().int().min(0), losses: z.number().int().min(0) }),
        jj: z.object({ hands: z.number().int().min(0), wins: z.number().int().min(0), losses: z.number().int().min(0) }),
        aa: z.object({ hands: z.number().int().min(0), wins: z.number().int().min(0), losses: z.number().int().min(0) }),
        ak: z.object({ hands: z.number().int().min(0), wins: z.number().int().min(0), losses: z.number().int().min(0) }),
      }))
      .mutation(async ({ ctx, input }) => {
        return await updateHandPatternManualStats(ctx.user.id, input);
      }),
  }),
  // Venues router
  venues: router({
    // Initialize preset venues for user
    initPresets: protectedProcedure
      .mutation(async ({ ctx }) => {
        await initializePresetVenues(ctx.user.id, PRESET_VENUES);
        return { success: true };
      }),

    // Create a custom venue
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        type: z.enum(["online", "live"]),
        logoUrl: z.string().optional(),
        website: z.string().optional(),
        address: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await createVenue({
          userId: ctx.user.id,
          ...input,
          isPreset: 0,
        });
      }),

    // Update a venue
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        name: z.string().min(1).max(128).optional(),
        type: z.enum(["online", "live"]).optional(),
        logoUrl: z.string().optional(),
        website: z.string().optional(),
        address: z.string().optional(),
        notes: z.string().optional(),
        currency: z.enum(["BRL", "USD", "CAD", "JPY", "CNY"]).optional(),
        balance: z.number().int().min(0).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return await updateVenue(id, ctx.user.id, data);
      }),
    // Update venue balance with history tracking
    updateBalance: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        balance: z.number().int().min(0),
        currency: z.enum(["BRL", "USD", "CAD", "JPY", "CNY"]).default("BRL"),
        note: z.string().max(256).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await updateVenueBalance(
          input.id,
          ctx.user.id,
          input.balance,
          input.currency,
          "manual",
          { note: input.note }
        );
      }),
    // Get balance history for a venue
    getBalanceHistory: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        limit: z.number().int().min(1).max(200).default(50),
      }))
      .query(async ({ ctx, input }) => {
        return await getVenueBalanceHistory(input.id, ctx.user.id, input.limit);
      }),
    // Get venues with stats (for TradeMap-style dashboard)
    listWithStats: protectedProcedure
      .query(async ({ ctx }) => {
        await initializePresetVenues(ctx.user.id, PRESET_VENUES);
        const allVenues = await getUserVenues(ctx.user.id);
        const venueStats = await getStatsByVenue(ctx.user.id);
        const statsMap = new Map(venueStats.map(s => [s.venueId, s]));
        return allVenues.map(v => ({
          ...v,
          stats: statsMap.get(v.id) || null,
        }));
      }),

    // Delete a venue
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return await deleteVenue(input.id, ctx.user.id);
      }),

    // Get a single venue
    get: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ ctx, input }) => {
        return await getVenueById(input.id, ctx.user.id);
      }),

    // List venues
    list: protectedProcedure
      .input(z.object({
        type: z.enum(["online", "live"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // Initialize presets if needed
        await initializePresetVenues(ctx.user.id, PRESET_VENUES);
        return await getUserVenues(ctx.user.id, input?.type);
      }),

    // Get statistics by venue
    statsByVenue: protectedProcedure
      .query(async ({ ctx }) => {
        await initializePresetVenues(ctx.user.id, PRESET_VENUES);
        return await getStatsByVenue(ctx.user.id);
      }),
  }),

  // Currency router
  currency: router({
    // Get current USD/BRL rate (legacy)
    getRate: protectedProcedure
      .query(async () => {
        const rate = await getUsdToBrlRate();
        return { rate };
      }),
    // Get all exchange rates (USD and JPY → BRL)
    getRates: publicProcedure
      .query(async () => {
        return await getAllRates();
      }),
    // Force refresh all rates (ignores cache)
    refresh: protectedProcedure
      .mutation(async () => {
        return await refreshRates();
      }),
  }),

  // Invites router
  invites: router({
    // Get user's personal invite code
    getMyCode: protectedProcedure
      .query(async ({ ctx }) => {
        const code = await getUserInviteCode(ctx.user.id);
        return { code };
      }),

    // Create a new invite
    create: protectedProcedure
      .input(z.object({
        email: z.string().email().optional(),
      }).optional())
      .mutation(async ({ ctx, input }) => {
        return await createInvite(ctx.user.id, input?.email);
      }),

    // Get invite by code
    getByCode: publicProcedure
      .input(z.object({ code: z.string() }))
      .query(async ({ input }) => {
        const invite = await getInviteByCode(input.code);
        if (!invite) return null;
        
        // Get inviter info
        const inviter = await getUserById(invite.inviterId);
        return {
          ...invite,
          inviterName: inviter?.name || "Usuário",
          inviterAvatar: inviter?.avatarUrl,
        };
      }),

    // Accept an invite (called after login)
    accept: protectedProcedure
      .input(z.object({ code: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return await acceptInvite(input.code, ctx.user.id);
      }),

    // Get user's sent invites
    list: protectedProcedure
      .query(async ({ ctx }) => {
        return await getUserInvites(ctx.user.id);
      }),

    // Get invite ranking
    ranking: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(10) }).optional())
      .query(async ({ input }) => {
        return await getInviteRanking(input?.limit ?? 10);
      }),
  }),

  // User profile router
  profile: router({
    // Update avatar from URL
    updateAvatar: protectedProcedure
      .input(
        z.object({
          avatarUrl: z.string().trim().min(1).refine(isAcceptedAvatarUrl, {
            message: "Avatar invalido. Use URL http(s), /avatars/... ou data:image/...",
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await updateUserAvatar(ctx.user.id, input.avatarUrl);
        return { success: true };
      }),

    // Upload avatar image (base64)
    uploadAvatar: protectedProcedure
      .input(z.object({
        base64: z.string(),
        mimeType: z.string(),
        fileName: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Decode base64
        const base64Data = input.base64.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        // Store avatar directly in DB as data URL to avoid external storage dependency.
        if (buffer.length > 1_000_000) {
          throw new Error("A imagem deve ter no maximo 1MB.");
        }

        const inlineUrl = `data:${input.mimeType};base64,${base64Data}`;
        await updateUserAvatar(ctx.user.id, inlineUrl);
        return { success: true, url: inlineUrl };
      }),

    // Get user by invite code (for invite page)
    getByInviteCode: publicProcedure
      .input(z.object({ code: z.string() }))
      .query(async ({ input }) => {
        const user = await getUserByInviteCode(input.code);
        if (!user) return null;
        return {
          name: user.name,
          avatarUrl: user.avatarUrl,
          inviteCount: user.inviteCount,
        };
      }),
  }),

  // Bankroll router
  bankroll: router({
    // Get bankroll settings
    getSettings: protectedProcedure
      .query(async ({ ctx }) => {
        const settings = await getBankrollSettings(ctx.user.id);
        if (!settings) {
          return {
            initialOnline: 100000, // R$ 1.000,00
            initialLive: 400000,   // R$ 4.000,00
          };
        }
        return {
          initialOnline: settings.initialOnline,
          initialLive: settings.initialLive,
        };
      }),

    // Update bankroll settings
    updateSettings: protectedProcedure
      .input(z.object({
        initialOnline: z.number().int().min(0).optional(),
        initialLive: z.number().int().min(0).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const current = await getBankrollSettings(ctx.user.id);
        return await upsertBankrollSettings(
          ctx.user.id,
          input.initialOnline ?? current?.initialOnline ?? 0,
          input.initialLive ?? current?.initialLive ?? 0
        );
      }),

    // Get current bankroll (initial + profits + fund transactions)
    getCurrent: protectedProcedure
      .query(async ({ ctx }) => {
        const settings = await getBankrollSettings(ctx.user.id);
        const initialOnline = settings?.initialOnline ?? 100000;
        const initialLive = settings?.initialLive ?? 400000;

        const onlineStats = await getSessionStats(ctx.user.id, "online");
        const liveStats = await getSessionStats(ctx.user.id, "live");
        const fundTotals = await getFundTransactionsTotals(ctx.user.id);

        const onlineCurrent = initialOnline + onlineStats.totalProfit + fundTotals.online.net;
        const liveCurrent = initialLive + liveStats.totalProfit + fundTotals.live.net;

        return {
          online: {
            initial: initialOnline,
            current: onlineCurrent,
            profit: onlineStats.totalProfit,
            fundNet: fundTotals.online.net,
            sessions: onlineStats.totalSessions,
            tables: onlineStats.totalTables,
          },
          live: {
            initial: initialLive,
            current: liveCurrent,
            profit: liveStats.totalProfit,
            fundNet: fundTotals.live.net,
            sessions: liveStats.totalSessions,
            tables: liveStats.totalTables,
          },
          total: {
            initial: initialOnline + initialLive,
            current: onlineCurrent + liveCurrent,
            profit: onlineStats.totalProfit + liveStats.totalProfit,
            fundNet: fundTotals.total.net,
            sessions: onlineStats.totalSessions + liveStats.totalSessions,
            tables: onlineStats.totalTables + liveStats.totalTables,
          },
        };
      }),

    // Get consolidated bankroll including venue balances (TradeMap-style)
    getConsolidated: protectedProcedure
      .query(async ({ ctx }) => {
        await initializePresetVenues(ctx.user.id, PRESET_VENUES);
        const settings = await getBankrollSettings(ctx.user.id);
        const initialLive = settings?.initialLive ?? 0;
        const initialOnline = settings?.initialOnline ?? 0;
        const liveStats = await getSessionStats(ctx.user.id, "live");
        const onlineStats = await getSessionStats(ctx.user.id, "online");
        const fundTotals = await getFundTransactionsTotals(ctx.user.id);
        
        // Get all venues with session stats (venues are just tags, no balance logic)
        const allVenues = await getUserVenues(ctx.user.id);
        const venueStats = await getStatsByVenue(ctx.user.id);
        const statsMap = new Map(venueStats.map(s => [s.venueId, s]));
        
        const venuesWithStats = allVenues.map((v) => ({
          ...v,
          balanceBrl: 0, // no per-venue balance in new logic
          stats: statsMap.get(v.id) || null,
        }));
        
        const onlineVenues = venuesWithStats.filter(v => v.type === "online");
        const liveVenues = venuesWithStats.filter(v => v.type === "live");
        
        // Online bankroll = initialOnline + all online session profit + fund movements
        const onlineBalanceTotal = initialOnline + onlineStats.totalProfit + fundTotals.online.net;
        
        // Live bankroll = initialLive + live session profit + fund movements
        const liveCurrent = initialLive + liveStats.totalProfit + fundTotals.live.net;
        
        // Total = online + live
        const totalCurrent = onlineBalanceTotal + liveCurrent;
        
        return {
          hasVenueBalances: false, // deprecated, kept for compatibility
          online: {
            current: onlineBalanceTotal,
            initial: initialOnline,
            profit: onlineStats.totalProfit,
            sessions: onlineStats.totalSessions,
            tables: onlineStats.totalTables,
            venues: onlineVenues,
          },
          live: {
            initial: initialLive,
            current: liveCurrent,
            profit: liveStats.totalProfit,
            sessions: liveStats.totalSessions,
            tables: liveStats.totalTables,
            venues: liveVenues,
          },
          total: {
            current: totalCurrent,
            profit: onlineStats.totalProfit + liveStats.totalProfit,
            sessions: onlineStats.totalSessions + liveStats.totalSessions,
            tables: onlineStats.totalTables + liveStats.totalTables,
          },
          allVenues: venuesWithStats,
        };
      }),
    // Detect if user has legacy bankroll (initialOnline > 0 but no venue balances)
    getLegacyMigrationStatus: protectedProcedure
      .query(async ({ ctx }) => {
        const settings = await getBankrollSettings(ctx.user.id);
        if (!settings || settings.initialOnline <= 0) return { needsMigration: false, legacyOnlineAmount: 0 };
        // Check if any online venue already has a balance
        const allVenues = await getUserVenues(ctx.user.id);
        const hasOnlineBalance = allVenues.some(v => v.type === "online" && v.balance > 0);
        if (hasOnlineBalance) return { needsMigration: false, legacyOnlineAmount: 0 };
        return {
          needsMigration: true,
          legacyOnlineAmount: settings.initialOnline, // centavos BRL
        };
      }),
    // Allocate legacy online balance to a specific venue
    completeLegacyMigration: protectedProcedure
      .input(z.object({
        allocations: z.array(z.object({
          venueId: z.number().int(),
          amount: z.number().int().min(0), // centavos BRL
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        // For each allocation, update the venue balance and record history
        for (const alloc of input.allocations) {
          if (alloc.amount <= 0) continue;
          await updateVenueBalance(alloc.venueId, ctx.user.id, alloc.amount, "BRL", "manual",
            { note: "Migração: saldo legado alocado a esta plataforma" });
        }
        // Zero out the legacy initialOnline so the banner disappears
        const current = await getBankrollSettings(ctx.user.id);
        await upsertBankrollSettings(ctx.user.id, 0, current?.initialLive ?? 0);
        return { success: true };
      }),
    // Get bankroll history for charts
    history: protectedProcedure
      .input(z.object({
        type: z.enum(["online", "live"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const settings = await getBankrollSettings(ctx.user.id);
        const sessions = await getBankrollHistory(ctx.user.id, input?.type);
        
        let initialOnline = settings?.initialOnline ?? 0;
        let initialLive = settings?.initialLive ?? 0;
        
        let runningOnline = initialOnline;
        let runningLive = initialLive;
        
        const history = sessions.map(session => {
          const profit = session.cashOut - session.buyIn;
          
          if (session.type === "online") {
            runningOnline += profit;
          } else {
            runningLive += profit;
          }
          
          return {
            date: session.sessionDate,
            online: runningOnline,
            live: runningLive,
            total: runningOnline + runningLive,
            sessionId: session.id,
            type: session.type,
            profit,
          };
        });
        
        const initialPoint = {
          date: sessions.length > 0 
            ? new Date(new Date(sessions[0].sessionDate).getTime() - 86400000)
            : new Date(),
          online: initialOnline,
          live: initialLive,
          total: initialOnline + initialLive,
          sessionId: 0,
          type: "initial" as const,
          profit: 0,
        };
        
        return [initialPoint, ...history];
      }),
  }),

  // Fund transactions router
  funds: router({
    // Create a new fund transaction (deposit or withdrawal)
    create: protectedProcedure
      .input(z.object({
        transactionType: z.enum(["deposit", "withdrawal"]),
        bankrollType: z.enum(["online", "live"]),
        amount: z.number().int().positive(),
        currency: currencyEnum.default("BRL"),
        description: z.string().optional(),
        transactionDate: z.date(),
      }))
      .mutation(async ({ ctx, input }) => {
        let amountBrl = input.amount;
        let originalAmount: number | undefined;
        let exchangeRate: number | undefined;

        // Convert USD to BRL if needed
        if (input.currency === "USD") {
          const rate = await getUsdToBrlRate();
          originalAmount = input.amount;
          exchangeRate = Math.round(rate * 10000);
          amountBrl = Math.round(input.amount * rate);
        }

        return await createFundTransaction(ctx.user.id, {
          transactionType: input.transactionType,
          bankrollType: input.bankrollType,
          amount: amountBrl,
          currency: input.currency,
          originalAmount,
          exchangeRate,
          description: input.description,
          transactionDate: input.transactionDate,
        });
      }),

    // List fund transactions
    list: protectedProcedure
      .input(z.object({
        bankrollType: z.enum(["online", "live"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return await getUserFundTransactions(ctx.user.id, input?.bankrollType);
      }),

    // Delete a fund transaction
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const success = await deleteFundTransaction(input.id, ctx.user.id);
        if (!success) {
          throw new Error("Transação não encontrada");
        }
        return { success: true };
      }),

    // Get totals (deposits, withdrawals, net) per bankroll type
    totals: protectedProcedure
      .query(async ({ ctx }) => {
        return await getFundTransactionsTotals(ctx.user.id);
      }),
  }),

  // Ranking routerr
  ranking: router({
    leaderboard: protectedProcedure
      .input(z.object({ friendsOnly: z.boolean().default(false) }).optional())
      .query(async ({ ctx, input }) => {
        return await getLeaderboard(ctx.user.id, input?.friendsOnly ?? false);
      }),
    friends: protectedProcedure
      .query(async ({ ctx }) => {
        return await getFriends(ctx.user.id);
      }),
    searchUsers: protectedProcedure
      .input(z.object({ query: z.string().trim().min(1).max(64) }))
      .query(async ({ ctx, input }) => {
        return await searchUsersToAdd(ctx.user.id, input.query);
      }),
    incomingRequests: protectedProcedure
      .query(async ({ ctx }) => {
        return await getIncomingFriendRequests(ctx.user.id);
      }),
    outgoingRequests: protectedProcedure
      .query(async ({ ctx }) => {
        return await getOutgoingFriendRequests(ctx.user.id);
      }),
    sendRequest: protectedProcedure
      .input(z.object({ friendId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (input.friendId === ctx.user.id) {
          throw new Error("Você não pode adicionar a si mesmo.");
        }
        return await sendFriendRequest(ctx.user.id, input.friendId);
      }),
    sendRequestByNickname: protectedProcedure
      .input(z.object({ nickname: z.string().trim().min(2).max(100) }))
      .mutation(async ({ ctx, input }) => {
        return await sendFriendRequestByNickname(ctx.user.id, input.nickname);
      }),
    respondRequest: protectedProcedure
      .input(z.object({ requestId: z.number().int().positive(), action: z.enum(["accept", "reject"]) }))
      .mutation(async ({ ctx, input }) => {
        return await respondToFriendRequest(ctx.user.id, input.requestId, input.action);
      }),
    cancelRequest: protectedProcedure
      .input(z.object({ requestId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const success = await cancelFriendRequest(ctx.user.id, input.requestId);
        return { success };
      }),
    removeFriend: protectedProcedure
      .input(z.object({ friendId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (input.friendId === ctx.user.id) {
          throw new Error("Ação inválida.");
        }
        const success = await removeFriendship(ctx.user.id, input.friendId);
        return { success };
      }),
    blockUser: protectedProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id) {
          throw new Error("Ação inválida.");
        }
        return await blockUser(ctx.user.id, input.userId);
      }),
    resetMyNetwork: protectedProcedure
      .mutation(async ({ ctx }) => {
        return await resetFriendshipNetworkForUser(ctx.user.id);
      }),
    resetAllNetwork: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Somente admin pode resetar globalmente." });
        }
        return await resetFriendshipNetworkGlobally();
      }),
  }),

  // Community feed router
  feed: router({
    handPatternStats: protectedProcedure
      .input(z.object({
        limit: z.number().int().min(1).max(50).optional(),
        minHands: z.number().int().min(1).max(200).optional(),
      }).optional())
      .query(async ({ input }) => {
        return await getGlobalHandPatternStats(input?.limit ?? 10, input?.minHands ?? 6);
      }),
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().optional(), offset: z.number().int().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return await getPublicFeed(ctx.user.id, input?.limit ?? 30, input?.offset ?? 0);
      }),
    create: protectedProcedure
      .input(z.object({
        content: z.string().max(1000).default(""),
        imageUrl: z.string().url().optional(),
        imageKey: z.string().optional(),
        sessionId: z.number().int().optional(),
        visibility: z.enum(["public", "friends"]).default("public"),
      }).superRefine((value, ctx) => {
        const hasContent = value.content.trim().length > 0;
        const hasImage = Boolean(value.imageUrl);
        if (!hasContent && !hasImage) {
          ctx.addIssue({
            code: "custom",
            message: "Informe um texto ou envie uma imagem para publicar.",
            path: ["content"],
          });
        }
      }))
      .mutation(async ({ ctx, input }) => {
        return await createPost({ ...input, content: input.content.trim(), userId: ctx.user.id });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return await deletePost(input.id, ctx.user.id);
      }),
    toggleLike: protectedProcedure
      .input(z.object({ postId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return await toggleLike(input.postId, ctx.user.id);
      }),
    getComments: protectedProcedure
      .input(z.object({ postId: z.number().int() }))
      .query(async ({ ctx, input }) => {
        return await getPostComments(input.postId);
      }),
    addComment: protectedProcedure
      .input(z.object({ postId: z.number().int(), content: z.string().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        return await createComment({ postId: input.postId, userId: ctx.user.id, content: input.content });
      }),
    deleteComment: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return await deleteComment(input.id, ctx.user.id);
      }),
    toggleReaction: protectedProcedure
      .input(z.object({ postId: z.number().int(), emoji: z.string().max(8) }))
      .mutation(async ({ ctx, input }) => {
        return await togglePostReaction(input.postId, ctx.user.id, input.emoji);
      }),
  }),

  // Clubs router
  clubs: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getUserClubs } = await import("./db");
      return getUserClubs(ctx.user.id);
    }),
    listWithStats: protectedProcedure.query(async ({ ctx }) => {
      const { getClubsWithStats } = await import("./db");
      return getClubsWithStats(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        logoUrl: z.string().url().optional(),
        type: z.enum(["online", "live"]).default("online"),
        allocatedAmount: z.number().int().min(0).default(0),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createClub } = await import("./db");
        return createClub({ ...input, userId: ctx.user.id });
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        name: z.string().min(1).max(128).optional(),
        logoUrl: z.string().url().optional().nullable(),
        type: z.enum(["online", "live"]).optional(),
        allocatedAmount: z.number().int().min(0).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateClub } = await import("./db");
        const { id, ...data } = input;
        return updateClub(id, ctx.user.id, data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteClub } = await import("./db");
        return deleteClub(input.id, ctx.user.id);
      }),
  }),

  // Upload image for posts
  upload: router({
    postImage: protectedProcedure
      .input(z.object({ base64: z.string(), mimeType: z.string() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const { storagePut } = await import("./storage");
          const buffer = Buffer.from(input.base64, "base64");
          const ext = input.mimeType.split("/")[1] || "jpg";
          const key = `posts/${ctx.user.id}-${Date.now()}.${ext}`;
          const { url } = await storagePut(key, buffer, input.mimeType);
          return { url, key };
        } catch (error: any) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error?.message || "Falha ao enviar imagem do post.",
          });
        }
      }),
    clubLogo: protectedProcedure
      .input(z.object({ base64: z.string(), mimeType: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.mimeType.split("/")[1] || "jpg";
        const key = `club-logos/${ctx.user.id}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        return { url, key };
      }),
  }),

  chat: router({
    conversations: protectedProcedure
      .query(async ({ ctx }) => {
        return await getConversationList(ctx.user.id);
      }),
    messages: protectedProcedure
      .input(z.object({ friendId: z.number().int().positive(), limit: z.number().int().min(1).max(100).optional(), before: z.number().int().positive().optional() }))
      .query(async ({ ctx, input }) => {
        const msgs = await getConversation(ctx.user.id, input.friendId, input.limit ?? 50, input.before);
        return msgs.reverse();
      }),
    send: protectedProcedure
      .input(z.object({ receiverId: z.number().int().positive(), content: z.string().trim().min(1).max(4000), caption: z.string().trim().max(500).optional(), type: z.enum(["text", "image"]).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (input.receiverId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Não pode enviar mensagem para si mesmo." });
        if ((input.type ?? "text") === "image" && !input.caption?.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Escreva uma mensagem antes de enviar a foto." });
        }
        return await sendMessage(ctx.user.id, input.receiverId, input.content, input.type ?? "text", input.caption);
      }),
    react: protectedProcedure
      .input(z.object({ messageId: z.number().int().positive(), emoji: z.string().trim().min(1).max(16) }))
      .mutation(async ({ ctx, input }) => {
        return await toggleMessageReaction(input.messageId, ctx.user.id, input.emoji);
      }),
    markRead: protectedProcedure
      .input(z.object({ friendId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await markConversationRead(ctx.user.id, input.friendId);
        return { ok: true };
      }),
    unreadCount: protectedProcedure
      .query(async ({ ctx }) => {
        return { count: await getUnreadCount(ctx.user.id) };
      }),
  }),
});
export type AppRouter = typeof appRouter;
