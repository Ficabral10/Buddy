// Minimal HTTP server (no dependencies). Endpoints:
//   GET  /health
//   GET  /library            -> the curated task library
//   POST /agent              -> Claude picks/rewords steps (with guardrails)
//   POST /tts                -> Cartesia audio (mp3) for one sentence
// Keys come from environment variables only. See ../.env.example.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibrary } from './library.js';
import { validateLibrary } from './validate.js';
import { runAgent, DEFAULT_MODEL } from './agent.js';
import { createTts } from './tts.js';

const MAX_BODY = 16 * 1024;
const LANGS = new Set(['en', 'es', 'zh']);
const EVENTS = new Set(['request', 'lost', 'question']);

export function createRateLimiter({ perMinute = 60, now = () => Date.now() } = {}) {
  const buckets = new Map();
  return (key) => {
    const t = now();
    const b = buckets.get(key) ?? { tokens: perMinute, at: t };
    b.tokens = Math.min(perMinute, b.tokens + ((t - b.at) / 60000) * perMinute);
    b.at = t;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    buckets.set(key, b);
    return true;
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) reject(Object.assign(new Error('Body too large'), { status: 413 }));
      else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

/** Serves the web app from /web and the shared detector modules from src/. No directory escapes. */
async function serveStatic(pathname, res, webDir, srcDir) {
  let file = null;
  if (pathname === '/' || pathname === '/index.html') file = path.join(webDir, 'index.html');
  else if (pathname === '/lib/detector.js' || pathname === '/lib/text.js') file = path.join(srcDir, path.basename(pathname));
  else if (pathname.startsWith('/app/')) {
    const candidate = path.resolve(webDir, `.${pathname.slice(4)}`);
    if (candidate.startsWith(webDir + path.sep)) file = candidate;
  }
  if (!file) return false;
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
  return true;
}

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

const str = (v, max = 500) => (typeof v === 'string' ? v.slice(0, max) : undefined);

export function createServer({ env = process.env, library = loadLibrary(), claude, tts, log = console.log } = {}) {
  const { errors } = validateLibrary(library);
  if (errors.length) throw new Error(`Task library invalid:\n${errors.join('\n')}`);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDir = path.resolve(here, '../../web');
  const synthesize = tts ?? createTts({ apiKey: env.CARTESIA_API_KEY, env, cacheDir: path.join(here, '../.audio-cache') });
  const allow = createRateLimiter({ perMinute: Number(env.RATE_LIMIT_PER_MINUTE || 120) });
  const clientToken = env.BUDDY_CLIENT_TOKEN || null;

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/health') return send(res, 200, { ok: true, libraryVersion: library.libraryVersion });
      if (req.method === 'GET' && (await serveStatic(url.pathname, res, webDir, here))) return;

      // A shared token is not real authentication; it only keeps casual traffic off a demo server.
      if (clientToken && req.headers['x-buddy-client'] !== clientToken) return send(res, 401, { error: 'unauthorized' });
      if (!allow(req.socket.remoteAddress ?? 'unknown')) return send(res, 429, { error: 'slow down' });

      if (req.method === 'GET' && url.pathname === '/library') return send(res, 200, library);

      if (req.method === 'POST' && url.pathname === '/agent') {
        const b = await readJson(req);
        const body = {
          userLanguage: LANGS.has(b.userLanguage) ? b.userLanguage : 'en',
          phoneLanguage: str(b.phoneLanguage, 20) ?? 'en',
          iosVersion: str(b.iosVersion, 20),
          event: EVENTS.has(b.event) ? b.event : 'request',
          text: str(b.text),
          taskId: str(b.taskId, 80),
          stepId: str(b.stepId, 80),
          screenTitle: str(b.screenTitle, 80), // only the title line, never full screen text
        };
        const reply = await runAgent(body, {
          library,
          apiKey: env.ANTHROPIC_API_KEY,
          model: env.CLAUDE_MODEL || DEFAULT_MODEL,
          ...(claude ? { claude } : {}),
          log,
        });
        log(`agent event=${body.event} action=${reply.action} source=${reply.source}${reply.guardrail ? ` guardrail=${reply.guardrail}` : ''}`);
        return send(res, 200, reply);
      }

      if (req.method === 'POST' && url.pathname === '/tts') {
        const b = await readJson(req);
        const text = str(b.text, 400);
        if (!text) return send(res, 400, { error: 'text required' });
        const { audio, cached } = await synthesize(text, LANGS.has(b.language) ? b.language : 'en');
        res.setHeader('x-cache', cached ? 'hit' : 'miss');
        return send(res, 200, audio, 'audio/mpeg');
      }

      return send(res, 404, { error: 'not found' });
    } catch (err) {
      log(`error: ${err.message}`);
      return send(res, err.status ?? 500, { error: err.status ? err.message : 'server error' });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  createServer().listen(port, () => {
    console.log(`Lola is running: open http://localhost:${port} on this computer.`);
    console.log('For your iPhone, run an HTTPS tunnel (see README: "Run it on your iPhone").');
    if (!process.env.ANTHROPIC_API_KEY) console.log('ANTHROPIC_API_KEY missing: /agent uses library-only replies.');
    if (!process.env.CARTESIA_API_KEY) console.log('CARTESIA_API_KEY missing: /tts returns 503; the app falls back to on-device speech.');
  });
}
