import {
  CHARGE_MAX,
  applyBlast,
  applyBomb,
  applyChain,
  applyGravity,
  applySpade,
  applySwap,
  cloneCells,
  strikeCell,
  conducts,
  DIRS,
  get,
  hasChain,
  inBounds,
  idx,
  mulberry32,
  pathValid,
  shuffleColors,
} from "./board.js";
import { parseLevel } from "./levels.js";

const VEC = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

function scale(session, dur) {
  return session.reduceMotion ? Math.min(dur, 0.08) : dur;
}

export function flood(session) {
  const newly = [];
  const queue = [];
  for (let i = 0; i < session.cells.length; i++) {
    if (session.cells[i].energized) queue.push(i);
  }
  const seen = new Set(queue);
  while (queue.length) {
    const current = queue.shift();
    const x = current % session.w;
    const y = (current / session.w) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(session, nx, ny)) continue;
      const ni = idx(session, nx, ny);
      if (seen.has(ni)) continue;
      const cell = session.cells[ni];
      if (!conducts(cell)) continue;
      seen.add(ni);
      cell.energized = true;
      cell.flowOrder = (session.cells[current].flowOrder || 0) + 1;
      newly.push({ x: nx, y: ny, dist: cell.flowOrder });
      queue.push(ni);
    }
  }
  return newly;
}

export function altarReached(session) {
  return session.cells.some((cell) => cell.kind === "altar" && cell.energized);
}

function fireArrow(session, x, y) {
  const origin = get(session, x, y);
  origin.fired = true;
  const affected = [];
  const triggered = [];
  for (const dir of origin.dirs) {
    const [dx, dy] = VEC[dir];
    let cx = x + dx;
    let cy = y + dy;
    while (inBounds(session, cx, cy)) {
      const cell = get(session, cx, cy);
      if (cell.kind === "void" || cell.kind === "source" || cell.kind === "altar") break;
      if (cell.kind === "arrow") {
        if (!cell.fired) triggered.push({ x: cx, y: cy });
        break;
      }
      if (cell.kind === "channel") {
        affected.push({ x: cx, y: cy, dir, ghost: null });
        cx += dx;
        cy += dy;
        continue;
      }
      if (cell.kind === "slab") {
        if (cell.ground > 0) cell.ground -= 1;
        cell.kind = "empty";
        cell.color = null;
        affected.push({ x: cx, y: cy, dir, ghost: { kind: "slab", color: null } });
        cx += dx;
        cy += dy;
        continue;
      }
      let ghost = null;
      let thawed = false;
      if (cell.kind === "gem" || cell.kind === "ice" || cell.kind === "stone") {
        const hit = strikeCell(cell, true);
        ghost = hit.ghost;
        thawed = hit.thawed;
      } else if (cell.ground > 0) cell.ground -= 1;
      affected.push({ x: cx, y: cy, dir, ghost, thawed });
      cx += dx;
      cy += dy;
    }
  }
  return { x, y, dirs: [...origin.dirs], affected, triggered };
}

function pushGravity(session, events) {
  const before = cloneCells(session.cells);
  const { moves, spawns } = applyGravity(session);
  if (!moves.length && !spawns.length) return;
  events.push({
    type: "gravity",
    before,
    snap: cloneCells(session.cells),
    moves,
    spawns,
    dur: scale(session, 0.26),
  });
}

function arrowsReady(session) {
  const list = [];
  for (let y = 0; y < session.h; y++) {
    for (let x = 0; x < session.w; x++) {
      const cell = get(session, x, y);
      if (cell.kind === "arrow" && cell.energized && !cell.fired) list.push({ x, y });
    }
  }
  return list;
}

function volley(session, events, seeds) {
  const queue = seeds.map((point) => ({ x: point.x, y: point.y }));
  const queued = new Set(seeds.map((point) => `${point.x},${point.y}`));
  while (queue.length) {
    const point = queue.shift();
    const cell = get(session, point.x, point.y);
    if (cell.kind !== "arrow" || cell.fired) continue;
    const before = cloneCells(session.cells);
    const shot = fireArrow(session, point.x, point.y);
    session.score += shot.affected.filter((item) => item.ghost).length * 10;
    events.push({
      type: "shot",
      before,
      snap: cloneCells(session.cells),
      shot,
      dur: scale(session, 0.32),
    });
    for (const hit of shot.triggered) {
      const id = `${hit.x},${hit.y}`;
      if (!queued.has(id)) {
        queued.add(id);
        queue.push(hit);
      }
    }
  }
}

function soften(session, events) {
  const ready = session.level.powers.some((id) => session.charges[id] >= CHARGE_MAX);
  const before = cloneCells(session.cells);
  let shuffled = false;
  for (let i = 0; i < 8 && !hasChain(session); i++) {
    if (!shuffleColors(session)) break;
    shuffled = true;
  }
  if (!shuffled && (hasChain(session) || ready)) return;
  const stuck = !hasChain(session);
  events.push({
    type: "notice",
    text: stuck
      ? "No move left. Use a power, or start over."
      : "No chain left. The gems have been rearranged.",
    before,
    snap: cloneCells(session.cells),
    dur: scale(session, 0.42),
  });
}

function releaseAnchors(session) {
  for (const cell of session.cells) cell.anchored = false;
}

export function resolve(session, events) {
  pushGravity(session, events);
  for (let guard = 0; guard < 48; guard++) {
    const before = cloneCells(session.cells);
    const flowed = flood(session);
    if (flowed.length) {
      const min = Math.min(...flowed.map((cell) => cell.dist));
      for (const cell of flowed) cell.dist -= min;
      events.push({
        type: "flow",
        before,
        snap: cloneCells(session.cells),
        cells: flowed,
        dur: scale(session, Math.min(0.72, 0.18 + flowed.length * 0.02)),
      });
    }
    if (altarReached(session)) {
      session.won = true;
      events.push({
        type: "win",
        before: cloneCells(session.cells),
        snap: cloneCells(session.cells),
        dur: scale(session, 0.4),
      });
      releaseAnchors(session);
      return;
    }
    const seeds = arrowsReady(session);
    if (!seeds.length) break;
    volley(session, events, seeds);
    pushGravity(session, events);
  }
  if (!session.won) soften(session, events);
  releaseAnchors(session);
}

function start(session, events) {
  session.chain = [];
  session.armed = null;
  session.swapPick = null;
  if (!events.length) {
    session.phase = session.won ? "win" : "play";
    session.anim = null;
    return;
  }
  session.queue = events;
  session.qi = 0;
  session.phase = "anim";
  session.anim = { t: 0, ev: events[0] };
  session.soundMark = "";
}

export function tick(session, dt) {
  if (session.shake > 0) session.shake = Math.max(0, session.shake - dt * 14);
  if (session.phase === "paused" || session.phase === "win" || session.phase === "lose") return;
  if (session.phase === "play") {
    session.time -= dt;
    if (session.time <= 0) {
      session.time = 0;
      session.phase = "lose";
    }
    return;
  }
  if (session.phase !== "anim" || !session.anim) return;
  session.anim.t += dt;
  if (session.anim.t < session.anim.ev.dur) return;
  if (session.anim.ev.type === "win") {
    session.timeBonus = Math.ceil(Math.max(0, session.time)) * 25;
    session.phase = "win";
    session.anim = null;
    return;
  }
  session.qi += 1;
  if (session.qi >= session.queue.length) {
    if (session.won) {
      session.timeBonus = Math.ceil(Math.max(0, session.time)) * 25;
      session.phase = "win";
    } else {
      session.phase = "play";
    }
    session.anim = null;
    return;
  }
  session.anim = { t: 0, ev: session.queue[session.qi] };
}

export function pauseSession(session) {
  if (session.phase === "win" || session.phase === "lose" || session.phase === "paused") return;
  session.pausedFrom = session.phase;
  session.phase = "paused";
}

export function resumeSession(session) {
  if (session.phase !== "paused") return;
  session.phase = session.pausedFrom || "play";
}

function ensureChain(session) {
  for (let i = 0; i < 24 && !hasChain(session); i++) {
    if (!shuffleColors(session)) break;
  }
}

export function createSession(level, seed = Date.now()) {
  const rng = mulberry32(seed >>> 0);
  const parsed = parseLevel(level, rng);
  const session = {
    level,
    rng,
    w: parsed.w,
    h: parsed.h,
    cells: parsed.cells,
    source: parsed.source,
    altar: parsed.altar,
    score: 0,
    timeBonus: 0,
    time: level.time,
    charges: { spade: 0, bomb: 0, swap: 0, shuffle: 0 },
    chain: [],
    armed: null,
    swapPick: null,
    hover: null,
    phase: "play",
    queue: [],
    anim: null,
    qi: 0,
    won: false,
    saved: false,
    cam: { x: 0, y: 0 },
    camReady: false,
    toast: "",
    toastUntil: 0,
    shake: 0,
    reduceMotion: false,
    pausedFrom: "play",
    soundMark: "",
  };
  for (const power of level.prime || []) session.charges[power] = CHARGE_MAX;
  flood(session);
  ensureChain(session);
  return session;
}

export function commitChain(session, path) {
  if (session.phase !== "play" || !pathValid(session, path)) return false;
  const events = [];
  const before = cloneCells(session.cells);
  const ghosts = applyChain(session, path);
  let blastGhosts = [];
  if (path.length >= 5) {
    const end = path[path.length - 1];
    const skip = new Set(path.map((point) => `${point.x},${point.y}`));
    blastGhosts = applyBlast(session, end.x, end.y, path.length, skip);
    session.shake = path.length >= 7 ? 8 : 5;
  }
  session.score += path.length * path.length * 10 + blastGhosts.length * 20;
  events.push({
    type: path.length >= 5 ? "blast" : "clear",
    before,
    snap: cloneCells(session.cells),
    ghosts,
    blastGhosts,
    length: path.length,
    dur: scale(session, path.length >= 5 ? 0.28 : 0.16),
  });
  resolve(session, events);
  start(session, events);
  return true;
}

export function commitSpade(session, x, y) {
  if (session.phase !== "play" || session.charges.spade < CHARGE_MAX) return false;
  if (!inBounds(session, x, y)) return false;
  const before = cloneCells(session.cells);
  const dug = applySpade(session, x, y);
  if (!dug) return false;
  session.charges.spade = 0;
  session.score += 40;
  const events = [
    {
      type: "clear",
      before,
      snap: cloneCells(session.cells),
      ghosts: [dug],
      blastGhosts: [],
      length: 1,
      dur: scale(session, 0.16),
    },
  ];
  resolve(session, events);
  start(session, events);
  return true;
}

export function commitBomb(session, x, y) {
  if (session.phase !== "play" || session.charges.bomb < CHARGE_MAX) return false;
  if (!inBounds(session, x, y) || get(session, x, y).kind === "void") return false;
  const before = cloneCells(session.cells);
  const blastGhosts = applyBomb(session, x, y);
  if (!blastGhosts?.length) return false;
  session.charges.bomb = 0;
  session.score += blastGhosts.length * 15;
  session.shake = 4;
  const events = [
    {
      type: "blast",
      before,
      snap: cloneCells(session.cells),
      ghosts: [],
      blastGhosts,
      length: 0,
      dur: scale(session, 0.24),
    },
  ];
  resolve(session, events);
  start(session, events);
  return true;
}

export function commitSwap(session, a, b) {
  if (session.phase !== "play" || session.charges.swap < CHARGE_MAX) return false;
  const before = cloneCells(session.cells);
  if (!applySwap(session, a, b)) return false;
  session.charges.swap = 0;
  const events = [
    {
      type: "swap",
      before,
      snap: cloneCells(session.cells),
      a,
      b,
      dur: scale(session, 0.18),
    },
  ];
  resolve(session, events);
  start(session, events);
  return true;
}

export function commitShuffle(session) {
  if (session.phase !== "play" || session.charges.shuffle < CHARGE_MAX) return false;
  const before = cloneCells(session.cells);
  if (!shuffleColors(session)) return false;
  session.charges.shuffle = 0;
  const events = [
    {
      type: "notice",
      text: "Gems shuffled.",
      before,
      snap: cloneCells(session.cells),
      dur: scale(session, 0.28),
    },
  ];
  resolve(session, events);
  start(session, events);
  return true;
}

function reachSet(session, passable) {
  const queue = [{ x: session.source.x, y: session.source.y }];
  const seen = new Set([`${session.source.x},${session.source.y}`]);
  while (queue.length) {
    const point = queue.shift();
    for (const [dx, dy] of DIRS) {
      const nx = point.x + dx;
      const ny = point.y + dy;
      if (!inBounds(session, nx, ny)) continue;
      const id = `${nx},${ny}`;
      if (seen.has(id) || !passable[idx(session, nx, ny)]) continue;
      seen.add(id);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

function bfs(session, passable, target) {
  return reachSet(session, passable).has(`${target.x},${target.y}`);
}

function canEventually(session) {
  const pass = session.cells.map((cell) => cell.kind !== "void" && cell.kind !== "slab");
  const fired = session.cells.map((cell) => cell.fired);
  const dirs = session.cells.map((cell) => (cell.dirs ? [...cell.dirs] : null));
  const kinds = session.cells.map((cell) => cell.kind);
  for (let guard = 0; guard < 40; guard++) {
    if (bfs(session, pass, session.altar)) return true;
    const reached = reachSet(session, pass);
    const queue = [];
    const queued = new Set();
    for (let y = 0; y < session.h; y++) {
      for (let x = 0; x < session.w; x++) {
        const i = idx(session, x, y);
        if (kinds[i] === "arrow" && !fired[i] && reached.has(`${x},${y}`)) {
          queue.push({ x, y });
          queued.add(`${x},${y}`);
        }
      }
    }
    if (!queue.length) return false;
    while (queue.length) {
      const point = queue.shift();
      const origin = idx(session, point.x, point.y);
      if (fired[origin]) continue;
      fired[origin] = true;
      for (const dir of dirs[origin] || []) {
        const [dx, dy] = VEC[dir];
        let x = point.x + dx;
        let y = point.y + dy;
        while (inBounds(session, x, y)) {
          const ci = idx(session, x, y);
          const kind = kinds[ci];
          if (kind === "void" || kind === "source" || kind === "altar") break;
          if (kind === "arrow") {
            const id = `${x},${y}`;
            if (!fired[ci] && !queued.has(id)) {
              queued.add(id);
              queue.push({ x, y });
            }
            break;
          }
          if (kind === "slab") pass[ci] = true;
          x += dx;
          y += dy;
        }
      }
    }
  }
  return false;
}

export function auditLevel(level) {
  const session = createSession(level, 12345);
  if (altarReached(session)) return { ok: false, reason: "prewon" };
  for (let y = 0; y < session.h; y++) {
    for (let x = 0; x < session.w; x++) {
      const cell = get(session, x, y);
      if (cell.kind === "arrow" && cell.energized) return { ok: false, reason: "hot-arrow" };
    }
  }
  const hasGate = /[RrS]/.test(level.grid.join(""));
  if (hasGate) {
    const open = session.cells.map(
      (cell) => cell.kind !== "void" && cell.kind !== "stone" && cell.kind !== "slab",
    );
    if (bfs(session, open, session.altar)) return { ok: false, reason: "bypass" };
  }
  if (!canEventually(session)) return { ok: false, reason: "sealed" };
  return { ok: true, reason: "ok" };
}
