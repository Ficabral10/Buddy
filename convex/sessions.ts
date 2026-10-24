import { mutation, query, internalMutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { takeToken, PER_MINUTE } from "./rateLimit";
// @ts-ignore plain JS module shared with node --test
import { checkSessionId, cap, language, LIMITS } from "./lib/guard.js";

// Sessions are anonymous: the phone makes a random UUID. Anyone holding that UUID can read the
// session's counters, which contain nothing personal. Production needs real auth (docs/BACKEND.md).

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

async function load(ctx: MutationCtx, sessionId: string) {
  const id = checkSessionId(sessionId);
  await takeToken(ctx, `session:${id}`, PER_MINUTE.session);
  const s = await ctx.db
    .query("sessions")
    .withIndex("by_sessionId", (q) => q.eq("sessionId", id))
    .unique();
  if (!s) throw new Error("Unknown session");
  return s;
}

async function log(ctx: MutationCtx, sessionId: string, type: any, step?: string) {
  await ctx.db.insert("events", { sessionId, type, step, at: Date.now() });
}

export const start = mutation({
  args: { sessionId: v.string(), locale: v.string(), userLanguage: v.string(), taskId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const id = checkSessionId(args.sessionId);
    await takeToken(ctx, `session:${id}`, PER_MINUTE.session);
    const locale = cap(args.locale, LIMITS.locale, "locale");
    const taskId = args.taskId ? cap(args.taskId, LIMITS.taskId, "taskId") : undefined;
    if (taskId) {
      const exists = await ctx.db.query("tasks").withIndex("by_taskId", (q) => q.eq("taskId", taskId)).unique();
      if (!exists) throw new Error("Unknown task");
    }
    const existing = await ctx.db.query("sessions").withIndex("by_sessionId", (q) => q.eq("sessionId", id)).unique();
    if (existing) return existing._id; // starting twice is harmless
    const now = Date.now();
    const _id = await ctx.db.insert("sessions", {
      sessionId: id, locale, userLanguage: language(args.userLanguage), taskId,
      step: 0, status: "active", hints: 0, lost: 0, wrongTurns: 0, startedAt: now, updatedAt: now,
    });
    await log(ctx, id, "start");
    return _id;
  },
});

export const advance = mutation({
  args: { sessionId: v.string(), toStep: v.number(), stepId: v.optional(v.string()) },
  handler: async (ctx, { sessionId, toStep, stepId }) => {
    const s = await load(ctx, sessionId);
    if (!Number.isInteger(toStep) || toStep < 0 || toStep > 50) throw new Error("Bad step");
    await ctx.db.patch(s._id, { step: toStep, updatedAt: Date.now() });
    await log(ctx, s.sessionId, "advance", stepId ? cap(stepId, LIMITS.stepId, "stepId") : undefined);
  },
});

function counter(field: "hints" | "lost" | "wrongTurns", type: "hint" | "lost" | "wrong_turn") {
  return mutation({
    args: { sessionId: v.string(), stepId: v.optional(v.string()) },
    handler: async (ctx, { sessionId, stepId }) => {
      const s = await load(ctx, sessionId);
      await ctx.db.patch(s._id, { [field]: s[field] + 1, updatedAt: Date.now() });
      await log(ctx, s.sessionId, type, stepId ? cap(stepId, LIMITS.stepId, "stepId") : undefined);
    },
  });
}

export const hint = counter("hints", "hint");
export const lost = counter("lost", "lost");
export const wrongTurn = counter("wrongTurns", "wrong_turn");

export const familyCall = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const s = await load(ctx, sessionId);
    await log(ctx, s.sessionId, "family_call");
  },
});

export const end = mutation({
  args: { sessionId: v.string(), status: v.union(v.literal("done"), v.literal("stopped")) },
  handler: async (ctx, { sessionId, status }) => {
    const s = await load(ctx, sessionId);
    await ctx.db.patch(s._id, { status, updatedAt: Date.now() });
    await log(ctx, s.sessionId, "end");
  },
});

/** Live view of one session (the app subscribes to it). Counters only. */
export const live = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    let id: string;
    try { id = checkSessionId(sessionId); } catch { return null; }
    const s = await ctx.db.query("sessions").withIndex("by_sessionId", (q) => q.eq("sessionId", id)).unique();
    if (!s) return null;
    return {
      taskId: s.taskId ?? null, step: s.step, status: s.status,
      hints: s.hints, lost: s.lost, wrongTurns: s.wrongTurns,
      startedAt: s.startedAt, updatedAt: s.updatedAt,
    };
  },
});

/** Daily cron: delete sessions, events and rate-limit rows older than 7 days, in batches. */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RETENTION_MS;
    let deleted = 0;
    const sessions = await ctx.db.query("sessions").withIndex("by_updatedAt", (q) => q.lt("updatedAt", cutoff)).take(200);
    for (const s of sessions) { await ctx.db.delete(s._id); deleted++; }
    const events = await ctx.db.query("events").withIndex("by_at", (q) => q.lt("at", cutoff)).take(1000);
    for (const e of events) { await ctx.db.delete(e._id); deleted++; }
    const limits = await ctx.db.query("rateLimits").take(1000);
    for (const r of limits) if (r.windowStart < cutoff) { await ctx.db.delete(r._id); deleted++; }
    return { deleted, more: sessions.length === 200 || events.length === 1000 };
  },
});
