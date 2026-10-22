export const CHARGE_MAX = 8;

export const POWER_BY_COLOR = {
  earth: "spade",
  fire: "bomb",
  air: "swap",
  water: "shuffle",
};

export const POWERS = [
  { id: "spade", name: "Spade", color: "earth", hint: "One cell, ground included" },
  { id: "bomb", name: "Bomb", color: "fire", hint: "Blast that does not dig" },
  { id: "swap", name: "Swap", color: "air", hint: "Two ordinary gems" },
  { id: "shuffle", name: "Shuffle", color: "water", hint: "A new gem layout" },
];

export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function idx(session, x, y) {
  return y * session.w + x;
}

export function inBounds(session, x, y) {
  return x >= 0 && y >= 0 && x < session.w && y < session.h;
}

export function get(session, x, y) {
  return session.cells[idx(session, x, y)];
}

export function cloneCells(cells) {
  return cells.map((cell) => ({
    ground: cell.ground,
    kind: cell.kind,
    color: cell.color,
    dirs: cell.dirs ? [...cell.dirs] : null,
    fired: cell.fired,
    energized: cell.energized,
    flowOrder: cell.flowOrder,
    frost: cell.frost || 0,
  }));
}

export function isMatchable(cell) {
  return cell.kind === "gem" || cell.kind === "ice";
}

export function isSlot(cell) {
  return !cell.anchored && (cell.kind === "gem" || cell.kind === "empty");
}

export function conducts(cell) {
  if (cell.ground !== 0) return false;
  return cell.kind !== "void" && cell.kind !== "stone" && cell.kind !== "slab";
}

export function randomColor(session) {
  const colors = session.level.colors;
  return colors[(session.rng() * colors.length) | 0];
}

export function hasChain(session) {
  const seen = new Uint8Array(session.cells.length);
  for (let i = 0; i < session.cells.length; i++) {
    if (seen[i] || !isMatchable(session.cells[i])) continue;
    const color = session.cells[i].color;
    const queue = [i];
    seen[i] = 1;
    let count = 0;
    while (queue.length) {
      const cur = queue.pop();
      count++;
      const x = cur % session.w;
      const y = (cur / session.w) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(session, nx, ny)) continue;
        const ni = idx(session, nx, ny);
        if (seen[ni]) continue;
        const next = session.cells[ni];
        if (isMatchable(next) && next.color === color) {
          seen[ni] = 1;
          queue.push(ni);
        }
      }
    }
    if (count >= 3) return true;
  }
  return false;
}

export function pathValid(session, path) {
  if (!path || path.length < 3) return false;
  const seen = new Set();
  let color = null;
  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    if (!inBounds(session, point.x, point.y)) return false;
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const cell = get(session, point.x, point.y);
    if (!isMatchable(cell)) return false;
    if (color == null) color = cell.color;
    else if (cell.color !== color) return false;
    if (i > 0) {
      const prev = path[i - 1];
      if (Math.abs(prev.x - point.x) + Math.abs(prev.y - point.y) !== 1) return false;
    }
  }
  return true;
}

export function blastOffsets(length) {
  if (length < 5) return [];
  const radius = length >= 7 ? 3 : length === 6 ? 2 : 1;
  const plus = length === 5;
  const offsets = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (plus && (dx !== 0 || dy !== 0) && Math.abs(dx) + Math.abs(dy) !== 1) continue;
      offsets.push([dx, dy]);
    }
  }
  return offsets;
}

export function canSpade(cell) {
  if (!cell) return false;
  if (
    cell.kind === "void" ||
    cell.kind === "source" ||
    cell.kind === "altar" ||
    cell.kind === "arrow" ||
    cell.kind === "slab" ||
    cell.kind === "channel"
  ) {
    return false;
  }
  if (cell.kind === "empty" && cell.ground <= 0) return false;
  return true;
}

function occupantGhost(cell) {
  if (cell.kind === "gem" || cell.kind === "ice" || cell.kind === "stone" || cell.kind === "slab") {
    return { kind: cell.kind, color: cell.color };
  }
  return null;
}

function clearKind(cell) {
  cell.kind = "empty";
  cell.color = null;
  cell.frost = 0;
}

export function strikeCell(cell, dig) {
  if (cell.kind === "ice") {
    cell.kind = "gem";
    cell.frost = 0;
    cell.anchored = true;
    return { thawed: true, ghost: null };
  }
  const ghost = occupantGhost(cell);
  if (cell.kind === "gem" || cell.kind === "stone") clearKind(cell);
  if (dig && cell.ground > 0) cell.ground -= 1;
  return { thawed: false, ghost };
}

export function applyChain(session, path) {
  const ghosts = [];
  for (const point of path) {
    const cell = get(session, point.x, point.y);
    const power = POWER_BY_COLOR[cell.color];
    if (power && session.level.powers.includes(power)) {
      session.charges[power] = Math.min(CHARGE_MAX, session.charges[power] + 1);
    }
    const wasIce = cell.kind === "ice";
    const color = cell.color;
    const hit = strikeCell(cell, true);
    if (!hit.thawed) ghosts.push({ x: point.x, y: point.y, color, ice: wasIce });
  }
  return ghosts;
}

export function applyBlast(session, x, y, length, skip) {
  const ghosts = [];
  for (const [dx, dy] of blastOffsets(length)) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(session, nx, ny)) continue;
    const key = `${nx},${ny}`;
    if (skip.has(key)) continue;
    const cell = get(session, nx, ny);
    if (
      cell.kind === "void" ||
      cell.kind === "source" ||
      cell.kind === "altar" ||
      cell.kind === "arrow" ||
      cell.kind === "slab" ||
      cell.kind === "channel"
    ) {
      continue;
    }
    const hit = strikeCell(cell, true);
    ghosts.push({ x: nx, y: ny, ghost: hit.ghost, thawed: hit.thawed });
  }
  return ghosts;
}

export function applySpade(session, x, y) {
  const cell = get(session, x, y);
  if (!canSpade(cell)) return null;
  const wasIce = cell.kind === "ice";
  const color = cell.color;
  const hit = strikeCell(cell, true);
  return { x, y, color: color ?? null, ice: wasIce, thawed: hit.thawed, ghost: hit.ghost };
}

export function applyBomb(session, x, y) {
  if (!inBounds(session, x, y) || get(session, x, y).kind === "void") return null;
  const ghosts = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(session, nx, ny)) continue;
      const cell = get(session, nx, ny);
      if (cell.kind !== "gem" && cell.kind !== "ice" && cell.kind !== "stone") continue;
      const hit = strikeCell(cell, false);
      ghosts.push({ x: nx, y: ny, ghost: hit.ghost, thawed: hit.thawed });
    }
  }
  return ghosts;
}

export function applySwap(session, a, b) {
  if (a.x === b.x && a.y === b.y) return false;
  const first = get(session, a.x, a.y);
  const second = get(session, b.x, b.y);
  if (first.kind !== "gem" || second.kind !== "gem") return false;
  const color = first.color;
  first.color = second.color;
  second.color = color;
  return true;
}

export function shuffleColors(session) {
  const gems = [];
  for (const cell of session.cells) {
    if (cell.kind === "gem") gems.push(cell.color);
  }
  if (gems.length < 2) return false;
  for (let i = gems.length - 1; i > 0; i--) {
    const j = (session.rng() * (i + 1)) | 0;
    [gems[i], gems[j]] = [gems[j], gems[i]];
  }
  let cursor = 0;
  let changed = false;
  for (const cell of session.cells) {
    if (cell.kind !== "gem") continue;
    if (cell.color !== gems[cursor]) changed = true;
    cell.color = gems[cursor++];
  }
  return changed;
}

export function applyGravity(session) {
  const moves = [];
  const spawns = [];
  for (let x = 0; x < session.w; x++) {
    let y = 0;
    while (y < session.h) {
      if (!isSlot(get(session, x, y))) {
        y++;
        continue;
      }
      const y0 = y;
      while (y < session.h && isSlot(get(session, x, y))) y++;
      const y1 = y;
      const gems = [];
      for (let yy = y0; yy < y1; yy++) {
        const cell = get(session, x, yy);
        if (cell.kind === "gem") gems.push({ from: yy, color: cell.color });
      }
      for (let yy = y0; yy < y1; yy++) {
        const cell = get(session, x, yy);
        cell.kind = "empty";
        cell.color = null;
      }
      const start = y1 - gems.length;
      gems.forEach((gem, i) => {
        const to = start + i;
        const cell = get(session, x, to);
        cell.kind = "gem";
        cell.color = gem.color;
        if (gem.from !== to) moves.push({ x, from: gem.from, to, color: gem.color });
      });
      let from = y0 - 1;
      for (let yy = y0; yy < start; yy++) {
        const color = randomColor(session);
        const cell = get(session, x, yy);
        cell.kind = "gem";
        cell.color = color;
        spawns.push({ x, y: yy, from, color });
        from--;
      }
    }
  }
  return { moves, spawns };
}

export function previewBlastCells(session, path) {
  if (!path || path.length < 5) return [];
  const end = path[path.length - 1];
  const skip = new Set(path.map((point) => `${point.x},${point.y}`));
  const cells = [];
  for (const [dx, dy] of blastOffsets(path.length)) {
    const nx = end.x + dx;
    const ny = end.y + dy;
    if (!inBounds(session, nx, ny) || skip.has(`${nx},${ny}`)) continue;
    const cell = get(session, nx, ny);
    if (
      cell.kind === "void" ||
      cell.kind === "source" ||
      cell.kind === "altar" ||
      cell.kind === "arrow" ||
      cell.kind === "slab" ||
      cell.kind === "channel"
    ) {
      continue;
    }
    cells.push({ x: nx, y: ny });
  }
  return cells;
}
