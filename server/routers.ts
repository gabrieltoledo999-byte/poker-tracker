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
  getBankrollSettings,
  upsertBankrollSettings,
  getBankrollHistory,
} from "./db";

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
        buyIn: z.number().int().positive(),
        cashOut: z.number().int().min(0),
        sessionDate: z.date(),
        durationMinutes: z.number().int().positive(),
        notes: z.string().optional(),
        gameType: z.string().optional(),
        stakes: z.string().optional(),
        location: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await createSession({
          userId: ctx.user.id,
          ...input,
        });
      }),

    // Update a session
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        type: z.enum(["online", "live"]).optional(),
        buyIn: z.number().int().positive().optional(),
        cashOut: z.number().int().min(0).optional(),
        sessionDate: z.date().optional(),
        durationMinutes: z.number().int().positive().optional(),
        notes: z.string().optional(),
        gameType: z.string().optional(),
        stakes: z.string().optional(),
        location: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
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
      }).optional())
      .query(async ({ ctx, input }) => {
        return await getSessionStats(ctx.user.id, input?.type);
      }),
  }),

  // Bankroll router
  bankroll: router({
    // Get bankroll settings
    getSettings: protectedProcedure
      .query(async ({ ctx }) => {
        const settings = await getBankrollSettings(ctx.user.id);
        if (!settings) {
          // Return default values if no settings exist
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
        
        // Calculate running bankroll for chart
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
        
        // Add initial point
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
