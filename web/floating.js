// Experimental: a floating card that stays on top of other apps, using Picture in Picture on
// a <video> fed by a <canvas>. Whether iOS Safari keeps it up (and keeps our page alive) while
// the user is in Settings must be tested on the phone. If it doesn't work, nothing breaks.
//
// Platform limit: the PiP window is a video. Nothing drawn inside it can be tapped. The only
// controls are the system's own buttons, which we map through the Media Session API:
// play/pause -> Pause/Resume, skip forward / next -> Next, skip back / previous -> Repeat.
// Which of those buttons iOS shows for a canvas stream is untested on a device.

const canvas = () => document.getElementById('card-canvas');
const video = () => document.getElementById('card-video');
let started = false;
let drawn = 0; // drop pictures that finish loading after a newer card was drawn

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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** An <img> for the step picture: a data URL (real screen) or SVG markup (drawing). */
function pictureImage(picture) {
  if (picture?.url) return loadImage(picture.url);
  if (picture?.svg) {
    // Drawn pictures size themselves by viewBox; give them pixels so the canvas can scale them.
    const [, , vw, vh] = (/viewBox="([\d.\s]+)"/.exec(picture.svg)?.[1] ?? '0 0 320 160').split(/\s+/).map(Number);
    const svg = picture.svg.replace('<svg ', `<svg width="${vw * 3}" height="${vh * 3}" `);
    return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  }
  return Promise.resolve(null);
}

function paint(ctx, c, text, step, img) {
  ctx.fillStyle = '#1c2945';
  ctx.fillRect(0, 0, c.width, c.height);
  // mascot
  ctx.fillStyle = '#f9b85c';
  ctx.beginPath(); ctx.arc(64, 70, 40, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(48, 54, 8, 15); ctx.fillRect(72, 54, 8, 15);
  ctx.fillRect(52, 86, 24, 5);
  // text
  ctx.fillStyle = '#fff';
  ctx.font = '600 38px -apple-system, system-ui, sans-serif';
  const max = img ? 4 : 11;
  const lines = wrap(ctx, text, c.width - 150);
  const shown = lines.slice(0, max);
  if (lines.length > max) shown[max - 1] = `${shown[max - 1].replace(/\s+\S*$/, '')}…`;
  shown.forEach((l, i) => ctx.fillText(l, 128, 62 + i * 46));
  const textBottom = Math.max(130, 62 + shown.length * 46);
  // picture: as large as fits under the text, centered, on rounded corners
  if (img) {
    const box = { x: 24, y: textBottom, w: c.width - 48, h: c.height - textBottom - 56 };
    const k = Math.min(box.w / img.width, box.h / img.height);
    const w = img.width * k;
    const h = img.height * k;
    const x = box.x + (box.w - w) / 2;
    const y = box.y + (box.h - h) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 18) : ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }
  ctx.font = '500 26px -apple-system, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(step ?? '', 24, c.height - 18);
}

/** Draws the card now, then again with the picture once it has loaded. */
export function drawCard({ text, step, picture = null }) {
  const c = canvas();
  if (!c) return;
  const ctx = c.getContext('2d');
  const id = ++drawn;
  paint(ctx, c, text, step, null);
  if (!picture) return;
  pictureImage(picture).then((img) => { if (img && id === drawn) paint(ctx, c, text, step, img); }, () => {});
  if ('mediaSession' in navigator && typeof MediaMetadata === 'function') {
    navigator.mediaSession.metadata = new MediaMetadata({ title: text, artist: step ?? '' });
  }
}

/** Wire the system PiP buttons to the helper. `actions`: {next, repeat, pause(on)}. */
export function setFloatingControls(actions) {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const set = (name, fn) => { try { ms.setActionHandler(name, fn); } catch { /* not supported here */ } };
  set('nexttrack', () => actions.next());
  set('seekforward', () => actions.next());
  set('previoustrack', () => actions.repeat());
  set('seekbackward', () => actions.repeat());
  set('pause', () => { actions.pause(true); ms.playbackState = 'paused'; });
  set('play', () => {
    actions.pause(false);
    ms.playbackState = 'playing';
    video()?.play().catch(() => {}); // keep the stream running so the card keeps updating
  });
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
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    if (v.requestPictureInPicture) await v.requestPictureInPicture();
    else if (v.webkitSetPresentationMode) v.webkitSetPresentationMode('picture-in-picture');
    return true;
  } catch {
    return false;
  }
}
