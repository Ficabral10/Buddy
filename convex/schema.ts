import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Per-language text, e.g. { en: "Settings", es: "Ajustes" }.
const perLang = v.record(v.string(), v.string());
const perLangList = v.record(v.string(), v.array(v.string()));

export const stepValidator = v.object({
  id: v.string(),
  label: perLang, // exact on-screen label, per phone UI language
  instruction: perLang, // per user language; contains {label}
  whereToLook: perLang,
  referenceImage: v.optional(v.string()),
  arrival: v.object({
    title: perLangList,
    anyOf: v.optional(perLangList),
    noneOf: v.optional(perLangList),
  }),
  wrongTurns: v.array(v.object({ id: v.string(), title: perLangList, hint: perLang })),
  hintTimingSec: v.object({ repeat: v.number(), describe: v.number(), picture: v.number() }),
  confirmWithUser: v.boolean(),
});

export const taskValidator = v.object({
  taskId: v.string(),
  version: v.number(),
  title: perLang,
  description: v.string(),
  exampleRequests: perLangList,
  finishAction: v.string(),
  labelsVerified: v.boolean(),
  steps: v.array(stepValidator),
});

export const eventType = v.union(
  v.literal("start"),
  v.literal("advance"),
  v.literal("hint"),
  v.literal("lost"),
  v.literal("wrong_turn"),
  v.literal("family_call"),
  v.literal("end"),
);

export default defineSchema({
  // The curated library. The only source of instructions.
  tasks: defineTable(taskValidator).index("by_taskId", ["taskId"]),

  // Anonymous help sessions. No names, no screen text, no transcripts, no audio.
  sessions: defineTable({
    sessionId: v.string(), // random UUID made on the phone
    locale: v.string(), // phone UI language, e.g. "es-US"
    userLanguage: v.string(), // "es" | "en"
    taskId: v.optional(v.string()),
    step: v.number(),
    status: v.union(v.literal("active"), v.literal("done"), v.literal("stopped")),
    hints: v.number(),
    lost: v.number(),
    wrongTurns: v.number(),
    startedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_updatedAt", ["updatedAt"]),

  // What happened, never what was said or seen.
  events: defineTable({
    sessionId: v.string(),
    type: eventType,
    step: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_at", ["at"]),

  // Cached Cartesia audio for LIBRARY lines only (never user or model text).
  stepAudio: defineTable({
    key: v.string(),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  // Fixed-window rate limits per session and per function.
  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),
});
