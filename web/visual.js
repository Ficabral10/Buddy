// Fallback pictures of what to look for, drawn in the iOS 26/27 style, with the label in the
// phone's language. When the library has a real screenshot of the step (library/screens), the
// app shows that instead. Drawings cover answers from the web and steps without a screenshot.
// Proportions follow iOS 26+ Settings at 393 pt wide scaled to 320: inset grouped lists with
// large corners, 52 pt rows, capsule switch and slider knobs, a round glass back button.
// Types and icons match backend/src/validate.js (VISUAL_TYPES, VISUAL_ICONS, SWIPE_DIRECTIONS).

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FONT = "-apple-system, 'SF Pro Text', system-ui, 'Apple SD Gothic Neo', sans-serif";
const RED = '#ff3b30';

// ---------- App icons: 100×100 glyphs on a rounded square ----------
const W = '#fff';
/** A toothed ring as a path: `teeth` square-ish teeth between radii r1 (root) and r2 (tip). */
function cog(r1, r2, teeth) {
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const d = (Math.PI * 2) / teeth;
    for (const [f, r] of [[0, r1], [0.18, r2], [0.5, r2], [0.68, r1]]) {
      pts.push(`${(50 + r * Math.sin(a + f * d)).toFixed(2)} ${(50 - r * Math.cos(a + f * d)).toFixed(2)}`);
    }
  }
  return `M${pts.join('L')}Z`;
}
// Settings: a fine-toothed outer gear, a lighter ring, and a smaller gear with spokes inside.
const gear = (fill, stroke) => `<path d="${cog(36, 40, 40)}" fill="${stroke}"/><circle cx="50" cy="50" r="33" fill="${fill}"/>
  <path d="${cog(22, 27, 14)}" fill="${stroke}"/><circle cx="50" cy="50" r="17" fill="${fill}"/>
  <g stroke="${stroke}" stroke-width="3.2">${[0, 60, 120].map((r) => `<line x1="50" y1="34" x2="50" y2="66" transform="rotate(${r} 50 50)"/>`).join('')}</g>
  <circle cx="50" cy="50" r="6" fill="${stroke}"/>`;
const ICONS = {
  settings: { bg: ['#d8d8dc', '#9a9aa0'], g: gear('#b4b4b9', '#48484d') },
  general: { bg: ['#a5a5aa', '#8e8e93'], g: gear('#9b9ba0', W) },
  display: { bg: ['#3d9bff', '#0a6ce8'], g: `<circle cx="50" cy="50" r="14" fill="${W}"/>
    <circle cx="50" cy="50" r="27" fill="none" stroke="${W}" stroke-width="7" stroke-dasharray="4 10.1" stroke-linecap="round"/>` },
  privacy: { bg: ['#3d9bff', '#0a6ce8'], g: `<g fill="${W}"><rect x="31" y="44" width="38" height="34" rx="14"/>
    <rect x="33" y="26" width="8" height="30" rx="4"/><rect x="42.5" y="20" width="8" height="34" rx="4"/>
    <rect x="52" y="22" width="8" height="32" rx="4"/><rect x="61.5" y="29" width="7.5" height="27" rx="3.75"/>
    <rect x="18" y="52" width="8" height="24" rx="4" transform="rotate(-38 22 64)"/></g>` },
  photos: { bg: ['#ffffff', '#f2f2f2'], g: ['#ffcc00', '#ff9500', '#ff3b30', '#ff2d92', '#af52de', '#007aff', '#34c759', '#a4d33b']
    .map((c, i) => `<ellipse cx="50" cy="32" rx="9" ry="17" fill="${c}" opacity="0.85" transform="rotate(${i * 45} 50 50)"/>`).join('') },
  camera: { bg: ['#a9a9ae', '#6e6e73'], g: `<rect x="20" y="34" width="60" height="40" rx="9" fill="#1c1c1e"/><rect x="38" y="27" width="22" height="10" rx="4" fill="#1c1c1e"/>
    <circle cx="50" cy="54" r="13" fill="#5ac8fa" stroke="${W}" stroke-width="4"/>` },
  whatsapp: { bg: ['#5af27a', '#1ebe57'], g: `<path d="M50 20a30 30 0 0 0-25.7 45.4L20 80l15-4a30 30 0 1 0 15-56z" fill="none" stroke="${W}" stroke-width="5.5" stroke-linejoin="round"/>
    <path d="M40 35c-2 0-4 3-3 7 2 8 9 16 18 19 4 1 7-1 7-3l-1-4-7-3-3 3c-4-2-7-5-9-9l3-3-3-7z" fill="${W}"/>` },
  accessibility: { bg: ['#3d9bff', '#0a6ce8'], g: `<circle cx="50" cy="50" r="30" fill="none" stroke="${W}" stroke-width="5"/><circle cx="50" cy="33" r="5" fill="${W}"/>
    <path d="M33 42h34M50 42v14M50 56l-9 14M50 56l9 14" stroke="${W}" stroke-width="5" stroke-linecap="round" fill="none"/>` },
  wifi: { bg: ['#3d9bff', '#0a6ce8'], g: `<g fill="none" stroke="${W}" stroke-width="7" stroke-linecap="round"><path d="M24 44a37 37 0 0 1 52 0"/><path d="M33 54a24 24 0 0 1 34 0"/></g><circle cx="50" cy="66" r="6" fill="${W}"/>` },
  bluetooth: { bg: ['#3d9bff', '#0a6ce8'], g: `<path d="M36 36l28 28-14 12V24l14 12-28 28" fill="none" stroke="${W}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>` },
  notifications: { bg: ['#ff6b5e', '#ff3b30'], g: `<path d="M50 22c-12 0-19 9-19 21v13l-6 8h50l-6-8V43c0-12-7-21-19-21z" fill="${W}"/><circle cx="50" cy="72" r="6" fill="${W}"/>` },
  sounds: { bg: ['#ff6b8a', '#ff2d55'], g: `<path d="M24 42h12l16-13v42L36 58H24z" fill="${W}"/><path d="M62 38a16 16 0 0 1 0 24M68 30a27 27 0 0 1 0 40" fill="none" stroke="${W}" stroke-width="5" stroke-linecap="round"/>` },
  phone: { bg: ['#5df07d', '#28c840'], g: `<path d="M33 22c-4 0-9 6-8 13 3 18 19 35 38 40 7 1 13-3 13-7l-1-7-12-5-6 6c-8-4-14-10-18-18l6-6-5-12z" fill="${W}"/>` },
  messages: { bg: ['#5df07d', '#28c840'], g: `<ellipse cx="50" cy="47" rx="30" ry="24" fill="${W}"/><path d="M28 62l-6 13 16-7z" fill="${W}"/>` },
  facetime: { bg: ['#5df07d', '#28c840'], g: `<rect x="18" y="33" width="44" height="34" rx="9" fill="${W}"/><path d="M64 46l18-11v30L64 54z" fill="${W}"/>` },
  mail: { bg: ['#5ec4ff', '#1a82fb'], g: `<rect x="18" y="30" width="64" height="42" rx="6" fill="${W}"/><path d="M19 32l31 24 31-24" fill="none" stroke="#1a82fb" stroke-width="4"/>` },
  safari: { bg: ['#ffffff', '#f0f0f0'], g: `<circle cx="50" cy="50" r="32" fill="#1a8cff"/><path d="M50 50l17-17-8 25z" fill="${RED}"/><path d="M50 50L33 67l8-25z" fill="${W}"/>` },
  appstore: { bg: ['#4bb8ff', '#0a6ce8'], g: `<path d="M41 24l-18 32M59 24l18 32M30 62h40M27 72l4-8M73 72l-4-8" stroke="${W}" stroke-width="6" stroke-linecap="round" fill="none"/>` },
  battery: { bg: ['#5df07d', '#28c840'], g: `<rect x="18" y="35" width="56" height="30" rx="7" fill="none" stroke="${W}" stroke-width="5"/><rect x="24" y="41" width="34" height="18" rx="3" fill="${W}"/><rect x="77" y="44" width="5" height="12" rx="2" fill="${W}"/>` },
  faceid: { bg: ['#5df07d', '#28c840'], g: `<g fill="none" stroke="${W}" stroke-width="5" stroke-linecap="round"><path d="M24 36v-6a6 6 0 0 1 6-6h6M64 24h6a6 6 0 0 1 6 6v6M76 64v6a6 6 0 0 1-6 6h-6M36 76h-6a6 6 0 0 1-6-6v-6"/>
    <path d="M40 40v5M60 40v5M50 42v12h-4M41 62c5 4 13 4 18 0"/></g>` },
  flashlight: { bg: ['#d1d1d6', '#aeaeb2'], g: `<path d="M38 22h24v10l-6 12v32a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V44l-6-12z" fill="#1c1c1e"/><circle cx="50" cy="56" r="3.5" fill="${W}"/>` },
  airplane: { bg: ['#ffb340', '#ff9500'], g: `<path d="M50 18c3 0 5 4 5 9v14l25 14v7l-25-7v13l7 6v5l-12-3-12 3v-5l7-6V55l-25 7v-7l25-14V27c0-5 2-9 5-9z" fill="${W}"/>` },
  rotation: { bg: ['#d1d1d6', '#aeaeb2'], g: `<rect x="40" y="38" width="20" height="24" rx="3" fill="#1c1c1e"/><path d="M50 22a28 28 0 1 1-24 14" fill="none" stroke="#1c1c1e" stroke-width="5"/><path d="M22 28l4 10 9-5z" fill="#1c1c1e"/>` },
  volume: { bg: ['#d1d1d6', '#aeaeb2'], g: `<path d="M26 42h10l14-12v40L36 58H26z" fill="#1c1c1e"/><path d="M60 38a16 16 0 0 1 0 24" fill="none" stroke="#1c1c1e" stroke-width="5" stroke-linecap="round"/>` },
  brightness: { bg: ['#d1d1d6', '#aeaeb2'], g: `<circle cx="50" cy="50" r="12" fill="#1c1c1e"/><circle cx="50" cy="50" r="25" fill="none" stroke="#1c1c1e" stroke-width="6" stroke-dasharray="4 9" stroke-linecap="round"/>` },
  maps: { bg: ['#9be38f', '#5ac85a'], g: `<path d="M18 30l20-8 24 8 20-8v48l-20 8-24-8-20 8z" fill="${W}" opacity="0.9"/><path d="M50 30c-8 0-13 6-13 12 0 9 13 22 13 22s13-13 13-22c0-6-5-12-13-12z" fill="#007aff"/>` },
  clock: { bg: ['#2c2c2e', '#000000'], g: `<circle cx="50" cy="50" r="32" fill="${W}"/><path d="M50 50V28M50 50l14 8" stroke="#000" stroke-width="5" stroke-linecap="round"/>` },
  calendar: { bg: ['#ffffff', '#f2f2f2'], g: `<text x="50" y="34" text-anchor="middle" font-size="15" font-weight="600" fill="${RED}" font-family="${FONT}">MON</text><text x="50" y="76" text-anchor="middle" font-size="42" fill="#1c1c1e" font-family="${FONT}">24</text>` },
  contacts: { bg: ['#d1d1d6', '#a1a1a6'], g: `<circle cx="50" cy="40" r="13" fill="${W}"/><path d="M26 76c2-14 12-20 24-20s22 6 24 20z" fill="${W}"/>` },
  youtube: { bg: ['#ffffff', '#f2f2f2'], g: `<rect x="18" y="30" width="64" height="42" rx="12" fill="#ff0000"/><path d="M44 40l16 11-16 11z" fill="${W}"/>` },
};

let uid = 0;
function iconSvg(name, x, y, size) {
  const ic = ICONS[name];
  if (!ic) return '';
  const id = `g${++uid}`;
  const s = size / 100;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ic.bg[0]}"/><stop offset="1" stop-color="${ic.bg[1]}"/></linearGradient></defs>
    <rect width="100" height="100" rx="24" fill="url(#${id})"${ic.bg[0] === '#ffffff' ? ' stroke="#d1d1d6" stroke-width="1.5"' : ''}/>${ic.g}
    <rect x="1.2" y="1.2" width="97.6" height="97.6" rx="23" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2.4"/></g>`;
}

// ---------- Pieces ----------
const fit = (label, room) => Math.max(11, Math.min(15, Math.floor((room / Math.max(1, [...label].length)) * 1.9)));
const ring = (x, y, w, h, r = 12) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${RED}" stroke-width="3">
  <animate attributeName="stroke-opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite"/></rect>`;
// The system's pointing-hand emoji, so it looks the same as everywhere else on the phone.
const hand = (x, y, size = 26) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle">👆</text>`;
const chevron = (x, y) => `<path d="M${x} ${y - 5.5}l5.5 5.5-5.5 5.5" fill="none" stroke="#bcbcc0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = (h, body, alt) => `<svg class="visual" viewBox="0 0 320 ${h}" role="img" aria-label="${esc(alt)}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}">${body}</svg>`;
const shadow = `<filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-opacity="0.22"/></filter>`;

/** One Settings row on an inset grouped card (iOS 26+). `right` draws the row's right end. */
function listCard(label, icon, right, alt) {
  const H = 112;
  const y = 30; // row top; the card is one 44-high row (52 pt), 13 in from each side, 21 corner
  const lx = icon ? 52 : 26;
  const size = fit(label, (right === 'toggle' ? 236 : 262) - lx);
  let end = '';
  if (right === 'chevron') end = chevron(288, y + 22);
  if (right === 'check') end = `<path d="M276 ${y + 22}l5 6 11-13" fill="none" stroke="#007aff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (right === 'toggle') {
    end = `<rect x="244" y="${y + 10.5}" width="51" height="23" rx="11.5" fill="#34c759"/>
      <rect x="268" y="${y + 12.5}" width="25" height="19" rx="9.5" fill="#fff" filter="url(#sh)"/>`;
  }
  const target = right === 'toggle'
    ? ring(238, y + 4, 63, 36, 18) + hand(270, y + 70)
    : ring(10, y - 3, 300, 50, 24) + hand(250, y + 76);
  return svg(H, `<defs>${shadow}</defs><rect width="320" height="${H}" fill="#f2f2f7"/>
    <rect x="13" y="${y}" width="294" height="44" rx="21" fill="#fff"/>
    ${icon ? iconSvg(icon, 22, y + 10, 24) : ''}
    <text x="${lx}" y="${y + 27}" font-size="${size}" fill="#000">${esc(label)}</text>${end}${target}`, alt);
}

function appIcon(label, icon) {
  const H = 200;
  const ghosts = [[44, 18], [124, 18], [204, 18], [44, 100], [204, 100]].map(([x, y]) => `<rect x="${x}" y="${y}" width="64" height="64" rx="16" fill="#fff" opacity="0.16"/>
    <rect x="${x + 14}" y="${y + 72}" width="36" height="6" rx="3" fill="#fff" opacity="0.18"/>`).join('');
  return svg(H, `<defs><linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f6bd8"/><stop offset="0.6" stop-color="#7a5bd0"/><stop offset="1" stop-color="#d77fa1"/></linearGradient></defs>
    <rect width="320" height="${H}" rx="14" fill="url(#wall)"/>${ghosts}
    ${ICONS[icon] ? iconSvg(icon, 128, 100, 64) : `<rect x="128" y="100" width="64" height="64" rx="16" fill="#fff" opacity="0.85"/>`}
    <text x="160" y="182" text-anchor="middle" font-size="${fit(label, 200)}" fill="#fff" font-weight="500">${esc(label)}</text>
    ${ring(116, 90, 88, 102, 22)}${hand(226, 168, 28)}`, label);
}

function slider(label) {
  const H = 112;
  return svg(H, `<defs>${shadow}</defs><rect width="320" height="${H}" fill="#f2f2f7"/>
    <rect x="13" y="22" width="294" height="68" rx="21" fill="#fff"/>
    <text x="32" y="62" font-size="13" fill="#000">${esc(label || 'A')}</text>
    <text x="270" y="66" font-size="26" fill="#000">${esc(label || 'A')}</text>
    <line x1="54" y1="56" x2="258" y2="56" stroke="#e5e5ea" stroke-width="5" stroke-linecap="round"/>
    <line x1="54" y1="56" x2="138" y2="56" stroke="#007aff" stroke-width="5" stroke-linecap="round"><animate attributeName="x2" values="138;228;138" dur="2.4s" repeatCount="indefinite"/></line>
    <rect x="120" y="46" width="36" height="20" rx="10" fill="#fff" stroke="#c7c7cc" stroke-width="0.8" filter="url(#sh)"><animate attributeName="x" values="120;210;120" dur="2.4s" repeatCount="indefinite"/></rect>
    <path d="M150 102h60m-8-6l8 6-8 6" fill="none" stroke="${RED}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`, label);
}

function button(label, icon) {
  const H = 150;
  if (icon && ICONS[icon]) {
    // A round Control Center button.
    return svg(H, `<rect width="320" height="${H}" rx="14" fill="#3a3a3c"/>
      <circle cx="160" cy="64" r="34" fill="#636366"/>${iconSvg(icon, 136, 40, 48)}
      ${label ? `<text x="160" y="126" text-anchor="middle" font-size="${fit(label, 240)}" fill="#fff">${esc(label)}</text>` : ''}
      ${ring(120, 24, 80, 80, 40)}${hand(212, 112)}`, label || icon);
  }
  const H2 = 112;
  return svg(H2, `<rect width="320" height="${H2}" fill="#f2f2f7"/>
    <rect x="13" y="30" width="294" height="44" rx="21" fill="#fff"/>
    <text x="160" y="57" text-anchor="middle" font-size="${fit(label, 240)}" fill="#007aff">${esc(label)}</text>
    ${ring(10, 27, 300, 50, 24)}${hand(250, 104)}`, label);
}

/** iOS 26+ back button: a round glass button with a chevron and no text, at the top left. */
function back(label) {
  const H = 96;
  return svg(H, `<defs>${shadow}</defs><rect width="320" height="${H}" fill="#f2f2f7"/>
    <circle cx="36" cy="40" r="19" fill="#fff" filter="url(#sh)"/>
    <path d="M39 31l-9 9 9 9" fill="none" stroke="#000" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    ${ring(12, 16, 48, 48, 24)}${hand(68, 90)}`, label || 'back');
}

const SWIPES = {
  'down-from-top-right': [[214, 30], [214, 150]],
  'down-from-top': [[160, 30], [160, 150]],
  'up-from-bottom': [[160, 222], [160, 110]],
  left: [[220, 126], [100, 126]],
  right: [[100, 126], [220, 126]],
};
function swipe(direction) {
  const [[x1, y1], [x2, y2]] = SWIPES[direction] ?? SWIPES['down-from-top'];
  const H = 250;
  return svg(H, `<rect width="320" height="${H}" fill="#f2f2f7"/>
    <rect x="98" y="8" width="124" height="234" rx="22" fill="#1c1c1e"/><rect x="104" y="14" width="112" height="222" rx="17" fill="#5b6ee1"/>
    <rect x="140" y="20" width="40" height="10" rx="5" fill="#1c1c1e"/>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 9" opacity="0.9"/>
    <circle r="12" fill="#fff" opacity="0.85" stroke="${RED}" stroke-width="3"><animate attributeName="cx" values="${x1};${x2}" dur="1.4s" repeatCount="indefinite"/>
      <animate attributeName="cy" values="${y1};${y2}" dur="1.4s" repeatCount="indefinite"/></circle>`, direction);
}

/**
 * SVG markup for one step, or '' when there is nothing accurate to draw.
 * visual: {type, icon?, direction?}; label: the on-screen text in the phone's language.
 */
export function drawVisual(visual, label = '') {
  if (!visual?.type) return '';
  switch (visual.type) {
    case 'app': return appIcon(label, visual.icon);
    case 'row': return label ? listCard(label, visual.icon, 'chevron', label) : '';
    case 'option': return label ? listCard(label, null, 'check', label) : '';
    case 'toggle': return label ? listCard(label, visual.icon, 'toggle', label) : '';
    case 'slider': return slider(label);
    case 'button': return label || visual.icon ? button(label, visual.icon) : '';
    case 'back': return back(label);
    case 'swipe': return swipe(visual.direction);
    default: return '';
  }
}
