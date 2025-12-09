import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
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
} from "./db";
import { getUsdToBrlRate, convertUsdToBrl } from "./currency";
import { PRESET_VENUES } from "@shared/presetVenues";

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
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return await updateVenue(id, ctx.user.id, data);
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
    // Get current USD/BRL rate
    getRate: protectedProcedure
      .query(async () => {
        const rate = await getUsdToBrlRate();
        return { rate };
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
        const { storagePut } = await import("./storage");
        const { nanoid } = await import("nanoid");
        
        // Decode base64
        const base64Data = input.base64.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        
        // Generate unique file key
        const ext = input.fileName.split(".").pop() || "jpg";
        const fileKey = `avatars/${ctx.user.id}-${nanoid(8)}.${ext}`;
        
        // Upload to S3
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        
        // Update user avatar URL
        await updateUserAvatar(ctx.user.id, url);
        
        return { success: true, url };
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
        initialOnline: z.number().int().min(0),
        initialLive: z.number().int().min(0),
      }))
      .mutation(async ({ ctx, input }) => {
        return await upsertBankrollSettings(
          ctx.user.id,
          input.initialOnline,
          input.initialLive
        );
      }),

    // Get current bankroll (initial + profits)
    getCurrent: protectedProcedure
      .query(async ({ ctx }) => {
        const settings = await getBankrollSettings(ctx.user.id);
        const initialOnline = settings?.initialOnline ?? 100000;
        const initialLive = settings?.initialLive ?? 400000;

        const onlineStats = await getSessionStats(ctx.user.id, "online");
        const liveStats = await getSessionStats(ctx.user.id, "live");

        return {
          online: {
            initial: initialOnline,
            current: initialOnline + onlineStats.totalProfit,
            profit: onlineStats.totalProfit,
            sessions: onlineStats.totalSessions,
          },
          live: {
            initial: initialLive,
            current: initialLive + liveStats.totalProfit,
            profit: liveStats.totalProfit,
            sessions: liveStats.totalSessions,
          },
          total: {
            initial: initialOnline + initialLive,
            current: initialOnline + initialLive + onlineStats.totalProfit + liveStats.totalProfit,
            profit: onlineStats.totalProfit + liveStats.totalProfit,
            sessions: onlineStats.totalSessions + liveStats.totalSessions,
          },
        };
      }),

    // Get bankroll history for charts
    history: protectedProcedure
      .input(z.object({
        type: z.enum(["online", "live"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const settings = await getBankrollSettings(ctx.user.id);
        const sessions = await getBankrollHistory(ctx.user.id, input?.type);
        
        let initialOnline = settings?.initialOnline ?? 100000;
        let initialLive = settings?.initialLive ?? 400000;
        
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
});

export type AppRouter = typeof appRouter;
