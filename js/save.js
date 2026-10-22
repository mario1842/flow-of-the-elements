import { LEVELS } from "./levels.js";

const KEY = "flow-of-the-elements-v1";

function emptySave() {
  return { unlocked: 0, stars: {}, best: {} };
}

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return emptySave();
    return {
      unlocked: Number.isInteger(raw.unlocked) ? raw.unlocked : 0,
      stars: raw.stars && typeof raw.stars === "object" ? raw.stars : {},
      best: raw.best && typeof raw.best === "object" ? raw.best : {},
    };
  } catch {
    return emptySave();
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* przeglądarka może odmówić zapisu */
  }
}

export function resetSave() {
  const fresh = emptySave();
  writeSave(fresh);
  return fresh;
}

export function starsFor(timeLeft, total) {
  const ratio = total > 0 ? timeLeft / total : 0;
  if (ratio >= 0.45) return 3;
  if (ratio >= 0.22) return 2;
  return 1;
}

export function recordWin(save, level, stars, timeLeft) {
  const previous = save.stars[level.id] || 0;
  if (stars > previous) save.stars[level.id] = stars;
  const best = save.best[level.id];
  if (best == null || timeLeft > best) save.best[level.id] = Math.round(timeLeft * 10) / 10;
  if (level.index === save.unlocked && level.index < LEVELS.length - 1) {
    save.unlocked = level.index + 1;
  }
  writeSave(save);
}

export function loadMute() {
  try {
    return localStorage.getItem("flow-of-the-elements-mute") === "1";
  } catch {
    return false;
  }
}

export function writeMute(muted) {
  try {
    localStorage.setItem("flow-of-the-elements-mute", muted ? "1" : "0");
  } catch {
    /* prywatny tryb może odmówić zapisu */
  }
}
