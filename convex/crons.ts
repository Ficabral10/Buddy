import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Keep nothing longer than 7 days. Runs hourly in small batches so a backlog clears quickly.
crons.interval("delete sessions older than 7 days", { hours: 1 }, internal.sessions.cleanup, {});

export default crons;
