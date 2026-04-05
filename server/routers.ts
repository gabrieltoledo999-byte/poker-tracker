import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getLeaderboard, getFriendIds, addFriendship, getPublicFeed, createPost, deletePost, toggleLike, getPostComments, createComment, deleteComment } from "./db";
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
const currencyEnum = z.enum(["BRL", "USD"]);

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
            throw new Error("Este e-mail já está cadastrado.");
          }
          throw new Error("Erro ao criar conta. Tente novamente.");
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
          throw new Error("E-mail ou senha incorretos.");
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
          if (err.message === "USER_NOT_FOUND") throw new Error("E-mail não encontrado.");
          if (err.message === "PASSWORD_ALREADY_SET") throw new Error("Esta conta já possui senha. Use o login normal.");
          throw new Error("Erro ao configurar senha. Tente novamente.");
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

        // Convert USD to BRL if needed
        if (input.currency === "USD") {
          const rate = await getUsdToBrlRate();
          exchangeRate = Math.round(rate * 10000); // Store as integer (5.50 = 55000)
          originalBuyIn = input.buyIn;
          originalCashOut = input.cashOut;
          buyInBrl = convertUsdToBrl(input.buyIn, rate);
          cashOutBrl = convertUsdToBrl(input.cashOut, rate);
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
        
        // If currency is being changed to USD and values provided, convert
        if (data.currency === "USD" && (data.buyIn || data.cashOut)) {
          const rate = await getUsdToBrlRate();
          const exchangeRate = Math.round(rate * 10000);
          
          if (data.buyIn) {
            (data as any).originalBuyIn = data.buyIn;
            data.buyIn = convertUsdToBrl(data.buyIn, rate);
          }
          if (data.cashOut !== undefined) {
            (data as any).originalCashOut = data.cashOut;
            data.cashOut = convertUsdToBrl(data.cashOut, rate);
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
        currency: z.enum(["BRL", "USD", "CAD", "JPY"]).default("BRL"),
        buyIn: z.number().int().min(0),
        gameType: z.string().optional(),
        stakes: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await addSessionTable({
          ...input,
          userId: ctx.user.id,
          startedAt: new Date(),
        });
      }),

    // Update a table (e.g. set cashOut when leaving)
    updateTable: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        venueId: z.number().int().optional(),
        type: z.enum(["online", "live"]).optional(),
        gameFormat: gameFormatEnum.optional(),
        currency: z.enum(["BRL", "USD", "CAD", "JPY"]).optional(),
        buyIn: z.number().int().min(0).optional(),
        cashOut: z.number().int().min(0).optional().nullable(),
        gameType: z.string().optional(),
        stakes: z.string().optional(),
        notes: z.string().optional(),
        endedAt: z.date().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return await updateSessionTable(id, ctx.user.id, data as any);
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
        currency: z.enum(["BRL", "USD", "JPY"]).optional(),
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
        currency: z.enum(["BRL", "USD", "CAD", "JPY"]).default("BRL"),
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
      .input(z.object({ avatarUrl: z.string().url() }))
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

        const onlineRaw = initialOnline + onlineStats.totalProfit + fundTotals.online.net;
        const liveRaw = initialLive + liveStats.totalProfit + fundTotals.live.net;
        const onlineCurrent = Math.max(0, onlineRaw);
        const liveCurrent = Math.max(0, liveRaw);

        return {
          online: {
            initial: initialOnline,
            current: onlineCurrent,
            profit: onlineStats.totalProfit,
            fundNet: fundTotals.online.net,
            sessions: onlineStats.totalSessions,
          },
          live: {
            initial: initialLive,
            current: liveCurrent,
            profit: liveStats.totalProfit,
            fundNet: fundTotals.live.net,
            sessions: liveStats.totalSessions,
          },
          total: {
            initial: initialOnline + initialLive,
            current: onlineCurrent + liveCurrent,
            profit: onlineStats.totalProfit + liveStats.totalProfit,
            fundNet: fundTotals.total.net,
            sessions: onlineStats.totalSessions + liveStats.totalSessions,
          },
        };
      }),

    // Get consolidated bankroll including venue balances (TradeMap-style)
    getConsolidated: protectedProcedure
      .query(async ({ ctx }) => {
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
        const onlineBalanceTotal = Math.max(0, initialOnline + onlineStats.totalProfit + fundTotals.online.net);
        
        // Live bankroll = initialLive + live session profit + fund movements
        const liveCurrent = initialLive + liveStats.totalProfit + fundTotals.live.net;
        
        // Total = online + live
        const totalCurrent = onlineBalanceTotal + Math.max(0, liveCurrent);
        
        return {
          hasVenueBalances: false, // deprecated, kept for compatibility
          online: {
            current: onlineBalanceTotal,
            initial: initialOnline,
            profit: onlineStats.totalProfit,
            sessions: onlineStats.totalSessions,
            venues: onlineVenues,
          },
          live: {
            initial: initialLive,
            current: Math.max(0, liveCurrent),
            profit: liveStats.totalProfit,
            sessions: liveStats.totalSessions,
            venues: liveVenues,
          },
          total: {
            current: totalCurrent,
            profit: onlineStats.totalProfit + liveStats.totalProfit,
            sessions: onlineStats.totalSessions + liveStats.totalSessions,
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
  }),

  // Community feed router
  feed: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().optional(), offset: z.number().int().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return await getPublicFeed(ctx.user.id, input?.limit ?? 30, input?.offset ?? 0);
      }),
    create: protectedProcedure
      .input(z.object({
        content: z.string().min(1).max(1000),
        imageUrl: z.string().url().optional(),
        imageKey: z.string().optional(),
        sessionId: z.number().int().optional(),
        visibility: z.enum(["public", "friends"]).default("public"),
      }))
      .mutation(async ({ ctx, input }) => {
        return await createPost({ ...input, userId: ctx.user.id });
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
        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.mimeType.split("/")[1] || "jpg";
        const key = `posts/${ctx.user.id}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        return { url, key };
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
});
export type AppRouter = typeof appRouter;
