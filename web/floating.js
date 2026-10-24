// Experimental: a floating card that stays on top of other apps, using Picture in Picture on
// a <video> fed by a <canvas>. Whether iOS Safari keeps it up (and keeps our page alive) while
// the user is in Settings must be tested on the phone. If it doesn't work, nothing breaks.

const canvas = () => document.getElementById('card-canvas');
const video = () => document.getElementById('card-video');
let started = false;

function wrap(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawCard({ text, step }) {
  const c = canvas();
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1c2945';
  ctx.fillRect(0, 0, c.width, c.height);
  // mascot
  ctx.fillStyle = '#f9b85c';
  ctx.beginPath(); ctx.arc(80, 90, 52, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(60, 70, 9, 18); ctx.fillRect(92, 70, 9, 18);
  ctx.fillRect(66, 110, 30, 6);
  // text
  ctx.fillStyle = '#fff';
  ctx.font = '600 40px -apple-system, system-ui, sans-serif';
  const lines = wrap(ctx, text, c.width - 190).slice(0, 5);
  lines.forEach((l, i) => ctx.fillText(l, 160, 80 + i * 50));
  ctx.font = '500 28px -apple-system, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(step ?? '', 160, c.height - 30);
}

export function floatingSupported() {
  const v = document.createElement('video');
  return Boolean(HTMLCanvasElement.prototype.captureStream) &&
    (Boolean(document.pictureInPictureEnabled) || typeof v.webkitSetPresentationMode === 'function');
}

/** Must be called from a tap. Returns true if PiP was requested without an error. */
export async function startFloating() {
  const v = video();
  if (!started) {
    v.srcObject = canvas().captureStream(2);
    started = true;
  }
  try {
    await v.play();
    if (v.requestPictureInPicture) await v.requestPictureInPicture();
    else if (v.webkitSetPresentationMode) v.webkitSetPresentationMode('picture-in-picture');
    return true;
  } catch {
    return false;
  }
}
