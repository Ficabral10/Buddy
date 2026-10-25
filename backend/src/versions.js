// iOS versions: which steps apply to this phone. Shared with the web app (served as /lib/versions.js).
// A step may carry `iosVersions: {min?, max?}` when a menu moved between iOS releases (for example,
// Text Size moved from Display & Brightness to Appearance in iOS 27). Steps without it apply everywhere.

/** "27.1" -> [27, 1]. Anything unreadable -> null. */
function parse(v) {
  const m = /^(\d+)(?:\.(\d+))?/.exec(String(v ?? ''));
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : null;
}

function cmp(a, b) {
  return a[0] - b[0] || a[1] - b[1];
}

/** True when `version` is inside `{min?, max?}` (both ends included). No range means every version. */
export function inRange(version, range) {
  if (!range) return true;
  const v = parse(version);
  if (!v) return true;
  const lo = parse(range.min);
  const hi = parse(range.max);
  return (!lo || cmp(v, lo) >= 0) && (!hi || cmp(v, hi) <= 0);
}

/**
 * The task with only the steps for this iOS version. When the version is unknown, assume the
 * newest one the task was written for, since most phones update.
 */
export function forIos(task, iosVersion) {
  const v = parse(iosVersion) ? iosVersion : task.iosVersions?.max;
  if (!task.steps.some((s) => s.iosVersions)) return task;
  return { ...task, steps: task.steps.filter((s) => inRange(v, s.iosVersions)) };
}

/**
 * The iOS version from a Safari user agent, as "major.minor", or null when it isn't an iPhone/iPad.
 * Since iOS 26, Safari freezes the OS part ("iPhone OS 18_6") but its "Version/26.x" matches the
 * iOS release, so prefer that when it is newer.
 */
export function iosFromUserAgent(ua = '') {
  if (!/iPhone|iPad|iPod/.test(ua)) return null;
  const os = /OS (\d+)_(\d+)/.exec(ua);
  const safari = /Version\/(\d+)(?:\.(\d+))?/.exec(ua);
  const a = os ? [Number(os[1]), Number(os[2])] : null;
  const b = safari ? [Number(safari[1]), Number(safari[2] ?? 0)] : null;
  // Other iOS browsers (no "Version/") also report the frozen 18_6, which could be 18.6 or newer.
  if (!b && a && a[0] === 18 && a[1] === 6) return null;
  const best = a && b ? (cmp(b, a) > 0 ? b : a) : a ?? b;
  return best ? `${best[0]}.${best[1]}` : null;
}
