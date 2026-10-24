// Reads a screenshot ON THIS PHONE with Tesseract.js (WebAssembly). The image never leaves
// the device. Returns lines in the same shape the step detector expects:
// { text, box: { x, y, w, h } } normalized 0..1 with a top-left origin.

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const MAX_WIDTH = 1000; // downscale big screenshots: faster, and Settings text stays readable

let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the text reader'));
    document.head.appendChild(s);
  });
}

/** Start loading early (e.g. when a session starts) so the first screenshot is quick. */
export function warmUp(phoneLang) {
  if (!workerPromise) {
    workerPromise = loadScript(TESSERACT_URL).then(() =>
      window.Tesseract.createWorker(phoneLang.startsWith('es') ? ['spa', 'eng'] : ['eng', 'spa']),
    );
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

async function toCanvas(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

function collectLines(data) {
  if (Array.isArray(data.lines) && data.lines.length) return data.lines;
  const out = [];
  for (const b of data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) out.push(l);
  return out;
}

export async function readScreenshot(file, phoneLang) {
  const [worker, canvas] = await Promise.all([warmUp(phoneLang), toCanvas(file)]);
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
  const W = canvas.width;
  const H = canvas.height;
  return collectLines(data)
    .map((l) => ({
      text: String(l.text ?? '').trim(),
      box: { x: l.bbox.x0 / W, y: l.bbox.y0 / H, w: (l.bbox.x1 - l.bbox.x0) / W, h: (l.bbox.y1 - l.bbox.y0) / H },
    }))
    .filter((l) => l.text.length > 0 && (l.text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 2);
}
