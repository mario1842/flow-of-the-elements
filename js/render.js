import {
  canSpade,
  clamp,
  get,
  inBounds,
  isMatchable,
  previewBlastCells,
} from "./board.js";

const INK = {
  earth: { gem: "#8ed36a", deep: "#245018", glow: "#e7ffc4" },
  fire: { gem: "#ff6d45", deep: "#8d2a16", glow: "#ffd2c2" },
  air: { gem: "#ffd056", deep: "#8a6412", glow: "#fff1c4" },
  water: { gem: "#49c6f2", deep: "#14688a", glow: "#d9f6ff" },
};

const SOIL = { 1: "#6d4c34", 2: "#4d3424", 3: "#362418" };

let motes = [];

export function resetFx() {
  motes = [];
}

export function burst(x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.6 + Math.random() * 1.8;
    motes.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.5,
      life: 0.28 + Math.random() * 0.28,
      max: 0.5,
      color,
      size: 0.06 + Math.random() * 0.08,
    });
  }
}

export function stepFx(dt) {
  motes = motes.filter((mote) => {
    mote.life -= dt;
    mote.x += mote.vx * dt;
    mote.y += mote.vy * dt;
    mote.vy += dt;
    return mote.life > 0;
  });
}

export function layoutBoard(session, viewW, viewH) {
  const pad = 16;
  const availW = Math.max(1, viewW - pad * 2);
  const availH = Math.max(1, viewH - pad * 2);
  const fit = Math.min(availW / session.w, availH / session.h);
  const base = Math.max(42, Math.min(56, fit));
  const zoom = clamp(session.zoom || 1, 0.75, 2.6);
  const cell = clamp(Math.round(base * zoom), 32, 120);
  const worldW = session.w * cell;
  const worldH = session.h * cell;
  const maxCamX = Math.max(0, worldW - availW);
  const maxCamY = Math.max(0, worldH - availH);
  session.cam.x = clamp(session.cam.x || 0, 0, maxCamX);
  session.cam.y = clamp(session.cam.y || 0, 0, maxCamY);
  const originX = maxCamX === 0 ? (viewW - worldW) / 2 : pad - session.cam.x;
  const originY = maxCamY === 0 ? (viewH - worldH) / 2 : pad - session.cam.y;
  return {
    cell,
    originX,
    originY,
    worldW,
    worldH,
    maxCamX,
    maxCamY,
    availW,
    availH,
    pad,
    overflow: maxCamX > 0 || maxCamY > 0,
  };
}

export function focusCamera(session, viewW, viewH) {
  const first = layoutBoard(session, viewW, viewH);
  if (first.maxCamX === 0 && first.maxCamY === 0) return first;
  const sx = session.source.x * first.cell + first.cell / 2;
  const sy = session.source.y * first.cell + first.cell / 2;
  session.cam.x = clamp(sx - first.availW * 0.33, 0, first.maxCamX);
  session.cam.y = clamp(sy - first.availH * 0.35, 0, first.maxCamY);
  return layoutBoard(session, viewW, viewH);
}

export function cellAt(session, viewW, viewH, localX, localY) {
  const lay = layoutBoard(session, viewW, viewH);
  const x = Math.floor((localX - lay.originX) / lay.cell);
  const y = Math.floor((localY - lay.originY) / lay.cell);
  if (!inBounds(session, x, y)) return { lay, cell: null };
  return { lay, cell: { x, y } };
}

export function fitCanvas(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w < 2 || h < 2) return { ctx: null, w: 0, h: 0 };
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function shownCells(session) {
  if (session.anim?.ev?.snap) return session.anim.ev.snap;
  return session.cells;
}

function ease(t) {
  const x = clamp(t, 0, 1);
  return 1 - (1 - x) ** 3;
}

function energyOn(session, cell, x, y) {
  if (!cell.energized) return false;
  const ev = session.anim?.ev;
  if (!ev || ev.type !== "flow") return true;
  const born = ev.cells.find((item) => item.x === x && item.y === y);
  if (!born) return true;
  const max = Math.max(...ev.cells.map((item) => item.dist), 0);
  const progress = (session.anim.t / ev.dur) * (max + 0.35);
  return born.dist <= progress;
}

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function hex(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 3;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r * 0.94;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function symbol(ctx, color, cx, cy, r) {
  ctx.strokeStyle = "rgba(255,255,255,.85)";
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.lineWidth = Math.max(1.4, r * 0.14);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (color === "earth") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.42);
    ctx.lineTo(cx + r * 0.42, cy + r * 0.32);
    ctx.lineTo(cx - r * 0.42, cy + r * 0.32);
    ctx.closePath();
    ctx.stroke();
  } else if (color === "fire") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.48);
    ctx.bezierCurveTo(cx + r * 0.46, cy - r * 0.05, cx + r * 0.3, cy + r * 0.42, cx, cy + r * 0.42);
    ctx.bezierCurveTo(cx - r * 0.34, cy + r * 0.2, cx - r * 0.16, cy - r * 0.05, cx, cy - r * 0.48);
    ctx.fill();
  } else if (color === "air") {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy + i * r * 0.28, r * 0.28, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.46);
    ctx.bezierCurveTo(cx + r * 0.42, cy - r * 0.05, cx + r * 0.28, cy + r * 0.42, cx, cy + r * 0.46);
    ctx.bezierCurveTo(cx - r * 0.28, cy + r * 0.42, cx - r * 0.42, cy - r * 0.05, cx, cy - r * 0.46);
    ctx.fill();
  }
}

function drawIceShell(ctx, cx, cy, radius) {
  ctx.save();
  hex(ctx, cx, cy, radius * 1.06);
  const glass = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius * 0.4, cy + radius);
  glass.addColorStop(0, "rgba(255,255,255,.78)");
  glass.addColorStop(0.42, "rgba(176, 224, 255, .34)");
  glass.addColorStop(1, "rgba(70, 130, 170, .22)");
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "rgba(255,255,255,.95)";
  ctx.stroke();
  hex(ctx, cx, cy, radius * 0.68);
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = "rgba(255,255,255,.45)";
  ctx.stroke();
  ctx.strokeStyle = "rgba(236, 250, 255, .92)";
  ctx.lineWidth = 1.35;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.62, cy - radius * 0.18);
  ctx.lineTo(cx - radius * 0.08, cy + radius * 0.02);
  ctx.lineTo(cx - radius * 0.22, cy + radius * 0.55);
  ctx.moveTo(cx - radius * 0.08, cy + radius * 0.02);
  ctx.lineTo(cx + radius * 0.48, cy - radius * 0.32);
  ctx.moveTo(cx + radius * 0.12, cy - radius * 0.08);
  ctx.lineTo(cx + radius * 0.34, cy + radius * 0.36);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.95)";
  for (const [sx, sy, sr] of [
    [-0.38, -0.48, 0.07],
    [0.42, 0.12, 0.05],
    [0.02, 0.46, 0.045],
  ]) {
    ctx.beginPath();
    ctx.arc(cx + radius * sx, cy + radius * sy, Math.max(0.8, radius * sr), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGem(ctx, cx, cy, r, color, frost, selected, scale = 1) {
  const ink = INK[color] || INK.earth;
  const radius = r * scale;
  if (radius < 1) return;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.38)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.86, radius * 0.7, radius * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  const grad = ctx.createRadialGradient(cx - radius * 0.32, cy - radius * 0.42, radius * 0.08, cx, cy + radius * 0.1, radius);
  grad.addColorStop(0, "#fff");
  grad.addColorStop(0.18, ink.glow);
  grad.addColorStop(0.55, ink.gem);
  grad.addColorStop(1, ink.deep);
  hex(ctx, cx, cy, radius);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.save();
  hex(ctx, cx, cy, radius * 0.96);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,.3)";
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius * 0.9);
  ctx.lineTo(cx + radius * 0.72, cy - radius * 0.12);
  ctx.lineTo(cx, cy + radius * 0.06);
  ctx.lineTo(cx - radius * 0.72, cy - radius * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.4)";
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.5, cy - radius * 0.18);
  ctx.lineTo(cx, cy + radius * 0.12);
  ctx.lineTo(cx + radius * 0.5, cy - radius * 0.18);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.beginPath();
  ctx.ellipse(cx - radius * 0.28, cy - radius * 0.4, radius * 0.16, radius * 0.08, -0.7, 0, Math.PI * 2);
  ctx.fill();
  hex(ctx, cx, cy, radius);
  ctx.lineWidth = selected ? 3 : 1.7;
  ctx.strokeStyle = selected ? "#fff8ea" : "rgba(255,255,255,.62)";
  ctx.stroke();
  hex(ctx, cx, cy, radius * 0.82);
  ctx.lineWidth = 1;
  ctx.strokeStyle = ink.deep;
  ctx.globalAlpha = 0.45;
  ctx.stroke();
  ctx.globalAlpha = 1;
  symbol(ctx, color, cx, cy, radius * 0.5);
  if (frost) drawIceShell(ctx, cx, cy, radius);
  ctx.restore();
}

function drawSoil(ctx, x, y, size, cell, showEnergy, ink, preview, now) {
  if (cell.kind === "void") return;
  const gap = Math.max(2, size * 0.08);
  const px = x * size + gap;
  const py = y * size + gap;
  const side = size - gap * 2;
  round(ctx, px, py, side, side, 7);
  ctx.fillStyle = "#1a140f";
  ctx.fill();
  if (showEnergy) {
    ctx.save();
    round(ctx, px + 2, py + 2, side - 4, side - 4, 6);
    ctx.clip();
    const grad = ctx.createLinearGradient(px, py + side, px, py);
    grad.addColorStop(0, ink.deep);
    grad.addColorStop(0.5, ink.gem);
    grad.addColorStop(1, ink.glow);
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, side, side);
    const drift = now / 420 + x * 0.85 + y * 0.4;
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = Math.max(1.4, side * 0.055);
    ctx.lineCap = "round";
    for (let band = 0; band < 3; band++) {
      ctx.globalAlpha = 0.28 + band * 0.08;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const tx = px + (side * i) / 8;
        const ty =
          py + side * (0.26 + band * 0.22) + Math.sin(drift * 1.3 + i * 0.75 + band * 1.4) * side * 0.055;
        if (i === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#fff";
    const hx = px + side * (0.28 + 0.44 * (0.5 + 0.5 * Math.sin(drift)));
    ctx.beginPath();
    ctx.ellipse(hx, py + side * 0.2, side * 0.16, side * 0.055, -0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.75;
    for (let b = 0; b < 3; b++) {
      const phase = (drift * 0.17 + b * 0.37) % 1;
      ctx.beginPath();
      ctx.arc(
        px + side * (0.2 + b * 0.28),
        py + side * (0.84 - phase * 0.58),
        Math.max(1, side * 0.03 * (0.55 + phase)),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  } else if (cell.ground > 0 && cell.kind !== "channel") {
    round(ctx, px + 2, py + 2, side - 4, side - 4, 6);
    ctx.fillStyle = SOIL[cell.ground] || SOIL[1];
    ctx.fill();
    ctx.fillStyle = "rgba(255, 232, 206, .38)";
    for (let i = 0; i < cell.ground; i++) {
      ctx.beginPath();
      ctx.arc(px + side * (0.32 + i * 0.16), py + side * 0.78, Math.max(1.3, side * 0.035), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    round(ctx, px + 3, py + 3, side - 6, side - 6, 6);
    ctx.fillStyle = "#241910";
    ctx.fill();
  }
  if (preview) {
    round(ctx, px, py, side, side, 7);
    ctx.fillStyle = "rgba(255, 140, 70, .35)";
    ctx.fill();
  }
}

function drawArrow(ctx, x, y, size, cell) {
  const cx = (x + 0.5) * size;
  const cy = (y + 0.5) * size;
  const radius = size * 0.26;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = cell.fired ? "#3f3a34" : "#6a6156";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = cell.fired ? "#8d847a" : "#f0d7a4";
  ctx.stroke();
  const vec = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  ctx.strokeStyle = cell.fired ? "#c4b8a8" : "#ffb15a";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  for (const dir of cell.dirs || []) {
    const [dx, dy] = vec[dir];
    ctx.beginPath();
    ctx.moveTo(cx + dx * radius * 0.1, cy + dy * radius * 0.1);
    ctx.lineTo(cx + dx * radius * 0.78, cy + dy * radius * 0.78);
    ctx.stroke();
  }
}

function drawStone(ctx, x, y, size) {
  const cx = (x + 0.5) * size;
  const cy = (y + 0.5) * size;
  const radius = size * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx - radius * 0.4, cy - radius * 0.85);
  ctx.lineTo(cx + radius * 0.45, cy - radius * 0.55);
  ctx.lineTo(cx + radius * 0.9, cy + radius * 0.1);
  ctx.lineTo(cx + radius * 0.2, cy + radius * 0.85);
  ctx.lineTo(cx - radius * 0.7, cy + radius * 0.45);
  ctx.closePath();
  ctx.fillStyle = "#8d8478";
  ctx.fill();
  ctx.strokeStyle = "#d9d0c4";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawSlab(ctx, x, y, size) {
  const gap = size * 0.16;
  const px = x * size + gap;
  const py = y * size + gap;
  const side = size - gap * 2;
  round(ctx, px, py, side, side, 4);
  const grad = ctx.createLinearGradient(px, py, px, py + side);
  grad.addColorStop(0, "#b7b1a8");
  grad.addColorStop(1, "#6d675f");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "#ece6dc";
  ctx.strokeRect(px + side * 0.18, py + side * 0.18, side * 0.64, side * 0.64);
}

function drawSource(ctx, x, y, size, ink, now) {
  const cx = (x + 0.5) * size;
  const cy = (y + 0.5) * size;
  const pulse = 0.5 + 0.5 * Math.sin(now / 260);
  ctx.beginPath();
  ctx.arc(cx, cy, size * (0.16 + pulse * 0.05), 0, Math.PI * 2);
  ctx.fillStyle = ink.glow;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = ink.gem;
  ctx.stroke();
}

function drawAltar(ctx, x, y, size, on, now) {
  const cx = (x + 0.5) * size;
  const cy = (y + 0.5) * size;
  const pulse = on ? 0.5 + 0.5 * Math.sin(now / 200) : 0;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.3, 0, Math.PI * 2);
  ctx.strokeStyle = on ? "#ffe7a8" : "#c7b18a";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, size * (0.12 + pulse * 0.04), 0, Math.PI * 2);
  ctx.fillStyle = on ? "#fff4cf" : "#6a5a42";
  ctx.fill();
}

function gemSprites(session) {
  const ev = session.anim?.ev;
  const cells = shownCells(session);
  const sprites = [];
  const skip = new Set();
  if (ev?.type === "gravity") {
    for (const move of ev.moves) skip.add(`${move.x},${move.to}`);
    for (const spawn of ev.spawns) skip.add(`${spawn.x},${spawn.y}`);
    const t = ease(session.anim.t / ev.dur);
    for (const move of ev.moves) {
      sprites.push({
        x: move.x,
        y: move.from + (move.to - move.from) * t,
        color: move.color,
      });
    }
    for (const spawn of ev.spawns) {
      sprites.push({
        x: spawn.x,
        y: spawn.from + (spawn.y - spawn.from) * t,
        color: spawn.color,
      });
    }
  } else if (ev?.type === "swap") {
    skip.add(`${ev.a.x},${ev.a.y}`);
    skip.add(`${ev.b.x},${ev.b.y}`);
    const t = ease(session.anim.t / ev.dur);
    const colorA = cells[ev.a.y * session.w + ev.a.x].color;
    const colorB = cells[ev.b.y * session.w + ev.b.x].color;
    sprites.push({
      x: ev.b.x + (ev.a.x - ev.b.x) * t,
      y: ev.b.y + (ev.a.y - ev.b.y) * t,
      color: colorA,
    });
    sprites.push({
      x: ev.a.x + (ev.b.x - ev.a.x) * t,
      y: ev.a.y + (ev.b.y - ev.a.y) * t,
      color: colorB,
    });
  }
  for (let y = 0; y < session.h; y++) {
    for (let x = 0; x < session.w; x++) {
      if (skip.has(`${x},${y}`)) continue;
      const cell = cells[y * session.w + x];
      if (cell.kind === "gem" || cell.kind === "ice") {
        sprites.push({ x, y, color: cell.color, frost: cell.kind === "ice" ? cell.frost || 2 : 0 });
      }
    }
  }
  return sprites;
}

function drawGhosts(ctx, session, size) {
  const ev = session.anim?.ev;
  if (!ev) return;
  const t = ease(session.anim.t / ev.dur);
  const scale = 1 - t;
  const paint = (x, y, color, ice, kind) => {
    const cx = (x + 0.5) * size;
    const cy = (y + 0.5) * size;
    if (kind === "stone") {
      ctx.globalAlpha = 1 - t;
      drawStone(ctx, x, y, size);
      ctx.globalAlpha = 1;
      return;
    }
    if (kind === "slab") {
      ctx.globalAlpha = 1 - t;
      drawSlab(ctx, x, y, size);
      ctx.globalAlpha = 1;
      return;
    }
    if (!color) return;
    drawGem(ctx, cx, cy, size * 0.34, color, ice ? 2 : 0, false, scale);
  };
  for (const ghost of ev.ghosts || []) {
    if (ghost.cracked || ghost.thawed) continue;
    paint(ghost.x, ghost.y, ghost.color, ghost.ice, "gem");
  }
  for (const ghost of ev.blastGhosts || []) {
    if (ghost.cracked || ghost.thawed) continue;
    paint(ghost.x, ghost.y, ghost.ghost?.color, ghost.ghost?.kind === "ice", ghost.ghost?.kind);
  }
  if (ev.type === "shot") {
    for (const item of ev.shot.affected) {
      if (!item.ghost || item.cracked || item.thawed) continue;
      paint(item.x, item.y, item.ghost.color, item.ghost.kind === "ice", item.ghost.kind);
    }
    const shown = Math.max(1, Math.ceil(ev.shot.affected.length * t));
    ctx.strokeStyle = "rgba(255, 210, 140, .9)";
    ctx.lineWidth = Math.max(3, size * 0.08);
    ctx.lineCap = "round";
    ctx.beginPath();
    const originX = (ev.shot.x + 0.5) * size;
    const originY = (ev.shot.y + 0.5) * size;
    ctx.moveTo(originX, originY);
    for (const item of ev.shot.affected.slice(0, shown)) {
      ctx.lineTo((item.x + 0.5) * size, (item.y + 0.5) * size);
    }
    ctx.stroke();
  }
}

function chainSelected(session, x, y) {
  return session.chain?.some((point) => point.x === x && point.y === y);
}

export function drawBoard(ctx, session, viewW, viewH, now) {
  const lay = layoutBoard(session, viewW, viewH);
  const ink = INK[session.level.book] || INK.earth;
  const cells = shownCells(session);
  ctx.clearRect(0, 0, viewW, viewH);
  const bg = ctx.createLinearGradient(0, 0, 0, viewH);
  bg.addColorStop(0, "#1a1418");
  bg.addColorStop(1, "#100e0c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.save();
  if (session.shake > 0.3) {
    ctx.translate((Math.random() - 0.5) * session.shake, (Math.random() - 0.5) * session.shake);
  }
  ctx.translate(lay.originX, lay.originY);

  const preview = new Set();
  if (session.chain?.length >= 5 && !session.anim) {
    for (const cell of previewBlastCells(session, session.chain)) preview.add(`${cell.x},${cell.y}`);
  }
  if (session.phase === "play" && session.armed === "bomb" && session.hover) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) preview.add(`${session.hover.x + dx},${session.hover.y + dy}`);
    }
  }

  for (let y = 0; y < session.h; y++) {
    for (let x = 0; x < session.w; x++) {
      const cell = cells[y * session.w + x];
      drawSoil(ctx, x, y, lay.cell, cell, energyOn(session, cell, x, y), ink, preview.has(`${x},${y}`), now);
    }
  }
  for (let y = 0; y < session.h; y++) {
    for (let x = 0; x < session.w; x++) {
      const cell = cells[y * session.w + x];
      if (cell.kind === "stone") drawStone(ctx, x, y, lay.cell);
      else if (cell.kind === "slab") drawSlab(ctx, x, y, lay.cell);
      else if (cell.kind === "arrow") drawArrow(ctx, x, y, lay.cell, cell);
      else if (cell.kind === "source") drawSource(ctx, x, y, lay.cell, ink, now);
      else if (cell.kind === "altar") drawAltar(ctx, x, y, lay.cell, energyOn(session, cell, x, y), now);
    }
  }

  const selected = (x, y) => Number.isInteger(x) && Number.isInteger(y) && chainSelected(session, x, y);
  for (const sprite of gemSprites(session)) {
    const hot =
      selected(sprite.x, sprite.y) ||
      (session.armed === "spade" &&
        session.hover &&
        sprite.x === session.hover.x &&
        sprite.y === session.hover.y);
    drawGem(
      ctx,
      (sprite.x + 0.5) * lay.cell,
      (sprite.y + 0.5) * lay.cell,
      lay.cell * 0.34,
      sprite.color,
      sprite.frost,
      hot,
    );
  }
  drawGhosts(ctx, session, lay.cell);

  if (session.chain?.length) {
    ctx.strokeStyle = "rgba(255,248,234,.85)";
    ctx.lineWidth = Math.max(3, lay.cell * 0.07);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    session.chain.forEach((point, index) => {
      const px = (point.x + 0.5) * lay.cell;
      const py = (point.y + 0.5) * lay.cell;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    if (session.chain.length >= 3) {
      const tail = session.chain[session.chain.length - 1];
      ctx.font = `700 ${Math.max(13, lay.cell * 0.28)}px Palatino, Georgia, serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff8ea";
      ctx.fillText(String(session.chain.length), (tail.x + 0.5) * lay.cell, tail.y * lay.cell - 4);
    }
  }

  if (session.phase === "play" && session.armed === "swap" && session.swapPick) {
    const pick = session.swapPick;
    ctx.strokeStyle = "#ffe08a";
    ctx.lineWidth = 3;
    ctx.strokeRect(pick.x * lay.cell + 4, pick.y * lay.cell + 4, lay.cell - 8, lay.cell - 8);
  }

  for (const mote of motes) {
    ctx.globalAlpha = Math.max(0, mote.life / mote.max);
    ctx.fillStyle = mote.color;
    ctx.beginPath();
    ctx.arc(mote.x * lay.cell, mote.y * lay.cell, mote.size * lay.cell, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  const vignette = ctx.createRadialGradient(
    viewW / 2,
    viewH / 2,
    Math.min(viewW, viewH) * 0.2,
    viewW / 2,
    viewH / 2,
    Math.max(viewW, viewH) * 0.72,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.38)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, viewW, viewH);
  session.layout = lay;
  return lay;
}

export function drawMinimap(ctx, session, w, h) {
  const lay = session.layout;
  const cells = shownCells(session);
  const ink = INK[session.level.book] || INK.earth;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#120f0c";
  ctx.fillRect(0, 0, w, h);
  const cw = w / session.w;
  const ch = h / session.h;
  for (let y = 0; y < session.h; y++) {
    for (let x = 0; x < session.w; x++) {
      const cell = cells[y * session.w + x];
      if (cell.kind === "void") continue;
      let color = "#5c4634";
      if (cell.kind === "stone" || cell.kind === "slab") color = "#8d8478";
      else if (energyOn(session, cell, x, y)) color = ink.gem;
      else if (cell.ground === 0) color = "#2a2118";
      ctx.fillStyle = color;
      ctx.fillRect(x * cw, y * ch, Math.ceil(cw), Math.ceil(ch));
    }
  }
  const mark = (point, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(point.x * cw + 1, point.y * ch + 1, Math.max(2, cw - 2), Math.max(2, ch - 2));
  };
  mark(session.source, "#f6efe2");
  mark(session.altar, "#ffd56a");
  if (lay && (lay.maxCamX > 0 || lay.maxCamY > 0)) {
    ctx.strokeStyle = "rgba(246,239,226,.85)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      (session.cam.x / lay.worldW) * w,
      (session.cam.y / lay.worldH) * h,
      (lay.availW / lay.worldW) * w,
      (lay.availH / lay.worldH) * h,
    );
  }
}

export function hoverSpade(session, x, y) {
  return canSpade(get(session, x, y));
}

export function gemColor(name) {
  return (INK[name] || INK.earth).gem;
}

export { isMatchable };
