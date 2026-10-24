import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { taskValidator } from "./schema";
// @ts-ignore plain JS module shared with node --test
import { validateTask } from "./lib/taskValidation.js";

/** Short catalog for the app's task list. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    return tasks.map((t) => ({ taskId: t.taskId, version: t.version, title: t.title }));
  },
});

/** One full task with all its steps. */
export const get = query({
  args: { taskId: v.string() },
  handler: async (ctx, { taskId }) => {
    if (taskId.length > 60) return null;
    const t = await ctx.db
      .query("tasks")
      .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
      .unique();
    if (!t) return null;
    const { _id, _creationTime, ...task } = t;
    return task;
  },
});

/** What Claude may choose from: ids, titles, descriptions, example requests. */
export const catalog = internalQuery({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    return tasks.map((t) => ({
      taskId: t.taskId,
      title: t.title,
      description: t.description,
      exampleRequests: t.exampleRequests,
    }));
  },
});

/** Internal: the text of one library line, for cached speech. */
export const stepText = internalQuery({
  args: { taskId: v.string(), stepId: v.string() },
  handler: async (ctx, { taskId, stepId }) => {
    const t = await ctx.db
      .query("tasks")
      .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
      .unique();
    return t?.steps.find((s) => s.id === stepId) ?? null;
  },
});

/**
 * Seed or update a task. Internal only: run it from scripts/seed-convex.mjs
 * (`npx convex run tasks:seed`), never from the app.
 */
export const seed = internalMutation({
  args: { task: taskValidator },
  handler: async (ctx, { task }) => {
    const problems: string[] = validateTask(task);
    if (problems.length) throw new Error(`Task ${task.taskId} rejected:\n${problems.join("\n")}`);
    const existing = await ctx.db
      .query("tasks")
      .withIndex("by_taskId", (q) => q.eq("taskId", task.taskId))
      .unique();
    if (existing) {
      await ctx.db.replace(existing._id, task);
      return { taskId: task.taskId, action: "updated" };
    }
    await ctx.db.insert("tasks", task);
    return { taskId: task.taskId, action: "inserted" };
  },
});
