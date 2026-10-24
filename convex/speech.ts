import { action, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { PER_MINUTE } from "./rateLimit";
// @ts-ignore plain JS module shared with node --test
import { checkSessionId, cap, language, LIMITS, lineFor } from "./lib/guard.js";

// Cartesia Sonic. Checked against docs.cartesia.ai on 2026-10-24: POST /tts/bytes,
// Cartesia-Version 2026-08-14, model sonic-3.6, Spanish = "es".
const CARTESIA_VERSION = "2026-08-14";

async function synthesize(text: string, lang: "es" | "en"): Promise<Blob> {
  const apiKey = process.env.CARTESIA_API_KEY;
  const voice = process.env[`CARTESIA_VOICE_ID_${lang.toUpperCase()}`];
  if (!apiKey || !voice) throw new Error("Speech is not configured");
  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Cartesia-Version": CARTESIA_VERSION, "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: process.env.CARTESIA_MODEL || "sonic-3.6",
      transcript: text,
      voice: { id: voice },
      language: lang,
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
      generation_config: { speed: 0.9 }, // a little slower for older listeners
    }),
  });
  if (!res.ok) throw new Error(`Cartesia ${res.status}`);
  return await res.blob();
}

async function cacheKey(text: string, lang: string) {
  const raw = `${process.env.CARTESIA_MODEL || "sonic-3.6"}|${process.env[`CARTESIA_VOICE_ID_${lang.toUpperCase()}`] ?? ""}|${lang}|${text}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const cached = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query("stepAudio").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return row ? await ctx.storage.getUrl(row.storageId) : null;
  },
});

export const remember = internalMutation({
  args: { key: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { key, storageId }) => {
    const row = await ctx.db.query("stepAudio").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (row) { await ctx.storage.delete(storageId); return; } // another call stored it first
    await ctx.db.insert("stepAudio", { key, storageId, createdAt: Date.now() });
  },
});

/**
 * Audio for a LIBRARY line (instruction or where-to-look), cached in file storage.
 * The text is built here from the library, so no user or model text is ever stored.
 * Returns a URL the app downloads; audio bytes never go through the action's return value.
 */
export const stepAudio = action({
  args: {
    sessionId: v.string(), taskId: v.string(), stepId: v.string(),
    kind: v.union(v.literal("instruction"), v.literal("whereToLook")),
    userLanguage: v.string(), phoneLanguage: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string; cached: boolean }> => {
    const id = checkSessionId(args.sessionId);
    await ctx.runMutation(internal.rateLimit.take, { key: `speech:${id}`, max: PER_MINUTE.speech });
    const step = await ctx.runQuery(internal.tasks.stepText, {
      taskId: cap(args.taskId, LIMITS.taskId, "taskId"), stepId: cap(args.stepId, LIMITS.stepId, "stepId"),
    });
    if (!step) throw new Error("Unknown step");
    const lang = language(args.userLanguage) as "es" | "en";
    const text: string = lineFor(step, args.kind, lang, cap(args.phoneLanguage, LIMITS.locale, "phoneLanguage"));
    const key = await cacheKey(text, lang);
    const hit = await ctx.runQuery(internal.speech.cached, { key });
    if (hit) return { url: hit, cached: true };
    const storageId = await ctx.storage.store(await synthesize(text, lang));
    await ctx.runMutation(internal.speech.remember, { key, storageId });
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Stored audio has no URL");
    return { url, cached: false };
  },
});

/**
 * Audio for any other short line (e.g. Claude's confirmation). Not stored anywhere:
 * the MP3 comes back base64-encoded (a sentence is ~50-100 KB, far below the 16 MiB limit).
 */
export const speak = action({
  args: { sessionId: v.string(), text: v.string(), language: v.string() },
  handler: async (ctx, args): Promise<{ audioBase64: string; mimeType: string }> => {
    const id = checkSessionId(args.sessionId);
    await ctx.runMutation(internal.rateLimit.take, { key: `speech:${id}`, max: PER_MINUTE.speech });
    const text = cap(args.text, LIMITS.speechText, "text").trim();
    if (!text) throw new Error("Nothing to say");
    const blob = await synthesize(text, language(args.language) as "es" | "en");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { audioBase64: btoa(binary), mimeType: "audio/mpeg" };
  },
});
