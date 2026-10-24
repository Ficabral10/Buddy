import { internalMutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

// Requests allowed per minute, per session.
export const PER_MINUTE = {
  session: 120, // session mutations
  ai: 20, // Claude calls
  speech: 60, // Cartesia calls
} as const;

const WINDOW_MS = 60_000;

/** Throws when the key is over its limit in the current one-minute window. */
export async function takeToken(ctx: MutationCtx, key: string, max: number) {
  const now = Date.now();
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row || now - row.windowStart >= WINDOW_MS) {
    if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
    else await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
    return;
  }
  if (row.count >= max) throw new Error("Too many requests. Please wait a moment.");
  await ctx.db.patch(row._id, { count: row.count + 1 });
}

/** For actions, which can't write directly. */
export const take = internalMutation({
  args: { key: v.string(), max: v.number() },
  handler: async (ctx, { key, max }) => takeToken(ctx, key, max),
});
