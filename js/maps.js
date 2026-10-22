function blank(w, h) {
  return Array.from({ length: h }, () => Array(w).fill("."));
}

function fill(g, x, y, w, h, ch) {
  const y1 = Math.min(g.length, y + h);
  const x1 = Math.min(g[0].length, x + w);
  for (let yy = Math.max(0, y); yy < y1; yy++) {
    for (let xx = Math.max(0, x); xx < x1; xx++) g[yy][xx] = ch;
  }
}

function ellipse(g, cx, cy, rx, ry, ch) {
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) g[y][x] = ch;
    }
  }
}

function shave(g, x, y, w, h, r) {
  const corners = [
    [x, y, 1, 1],
    [x + w - 1, y, -1, 1],
    [x, y + h - 1, 1, -1],
    [x + w - 1, y + h - 1, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    for (let dy = 0; dy < r; dy++) {
      for (let dx = 0; dx < r; dx++) {
        if (dx * dx + dy * dy >= r * r) continue;
        const xx = cx + sx * dx;
        const yy = cy + sy * dy;
        const ch = g[yy]?.[xx];
        if (ch === "1" || ch === "2" || ch === "3") g[yy][xx] = ".";
      }
    }
  }
}

function lines(g) {
  return g.map((row) => row.join(""));
}

function cavern(g, w, h, opt) {
  const salt = opt.salt || 1;
  const ch = opt.ch || "1";
  const cx = (w / 2) | 0;
  const cy = (h / 2) | 0;
  ellipse(g, cx + ((salt % 5) - 2), cy, w / 2 - 1.4, h / 2 - 1.3, ch);
  const bite = 6 + (salt % 5);
  if (salt % 2 === 0) fill(g, 0, 0, bite, bite, ".");
  else fill(g, w - bite, h - bite, bite, bite, ".");
  if (salt % 3 === 0) fill(g, (w * 0.32) | 0, (h * 0.18) | 0, 7, 4, ".");
  const row = cy;
  let left = -1;
  let right = -1;
  for (let x = 0; x < w; x++) {
    if (g[row][x] === ".") continue;
    if (left < 0) left = x;
    right = x;
  }
  g[row][left + 2] = "*";
  g[row][right - 2] = "O";
}

function bend(g, w, h) {
  const t = 11;
  fill(g, 2, 2, (w * 0.7) | 0, t, "1");
  fill(g, (w * 0.28) | 0, h - 2 - t, (w * 0.7) | 0, t, "1");
  fill(g, (w * 0.42) | 0, 2, t, h - 4, "1");
  g[5][5] = "*";
  g[h - 7][w - 7] = "O";
}

function splitV(g, w, h, opt) {
  const salt = opt.salt || 0;
  const wx = Math.floor(w * (0.4 + (salt % 5) * 0.03));
  const left = opt.left || "1";
  const right = opt.right || "1";
  const y0 = 2;
  const bh = h - 4;
  fill(g, 2, y0, wx - 2, bh, left);
  fill(g, wx + 1, y0, w - 3 - wx, bh, right);
  for (let y = y0; y < y0 + bh; y++) g[y][wx] = "R";
  shave(g, 2, y0, wx - 2, bh, 7);
  shave(g, wx + 1, y0, w - 3 - wx, bh, 6);
  const sy = (h / 2) | 0;
  g[sy][5] = "*";
  g[sy][w - 6] = "O";
}

function splitH(g, w, h, opt) {
  const walls = opt.walls || 1;
  const ch = opt.ch || "1";
  const bands = walls + 1;
  const bandH = Math.floor((h - 4 - walls) / bands);
  let y = 2;
  for (let i = 0; i < bands; i++) {
    fill(g, 2, y, w - 4, bandH, ch);
    shave(g, 2, y, w - 4, bandH, 5);
    if (i === 0) g[y + 3][5] = "*";
    if (i === bands - 1) g[y + bandH - 4][w - 6] = "O";
    y += bandH;
    if (i < walls) {
      for (let x = 2; x < w - 2; x++) g[y][x] = "R";
      y += 1;
    }
  }
}

function neck(g, w, h) {
  const mid = (h / 2) | 0;
  fill(g, 6, 3, w - 8, h - 6, "1");
  shave(g, 6, 3, w - 8, h - 6, 8);
  g[mid][3] = "*";
  g[mid][4] = "e";
  g[mid][5] = "1";
  g[mid + 8][w - 8] = "O";
}

function iceBridge(g, w, h, opt) {
  const gap = opt.gap || 8;
  const iceH = opt.iceH || 5;
  const leftW = Math.floor((w - gap) / 2) - 2;
  fill(g, 2, 2, leftW, h - 4, "1");
  const rightX = 2 + leftW + gap;
  fill(g, rightX, 2, w - 2 - rightX, h - 4, "1");
  shave(g, 2, 2, leftW, h - 4, 6);
  shave(g, rightX, 2, w - 2 - rightX, h - 4, 6);
  const gy = (h / 2) | 0;
  fill(g, 2 + leftW - 1, gy - ((iceH / 2) | 0), gap + 2, iceH, "I");
  g[gy - 6][5] = "*";
  g[gy + 6][w - 6] = "O";
}

function iceFloor(g, w, h) {
  const mid = (h / 2) | 0;
  fill(g, 2, 2, w - 4, mid - 4, "1");
  shave(g, 2, 2, w - 4, mid - 4, 6);
  fill(g, 2, mid - 2, w - 4, 3, "I");
  fill(g, 2, mid + 1, w - 4, h - mid - 3, "1");
  shave(g, 2, mid + 1, w - 4, h - mid - 3, 5);
  g[8][8] = "*";
  g[h - 12][(w / 2) | 0] = "O";
}

function arrowDown(g, w, h, opt) {
  const mid = Math.floor(h * (opt.top || 0.48));
  const ax = Math.floor(w * (opt.ax || 0.58));
  fill(g, 2, 2, w - 4, mid - 2, "1");
  shave(g, 2, 2, w - 4, mid - 2, 6);
  g[mid - 1][ax] = "v";
  g[mid][ax] = "S";
  fill(g, 2, mid + 1, w - 4, h - mid - 3, "1");
  shave(g, 2, mid + 1, w - 4, h - mid - 3, 5);
  g[8][8] = "*";
  g[mid + 6][(w / 2) | 0] = "O";
}

function volley(g, w, h, opt) {
  const mid = Math.floor(h * 0.5);
  const ax = Math.floor(w * (opt.ax || 0.9));
  fill(g, 2, 2, w - 4, mid - 2, "1");
  const row = mid - 4;
  g[row][ax - 1] = ">";
  g[row][ax] = "v";
  g[mid][ax] = "S";
  fill(g, 2, mid + 1, w - 4, h - mid - 3, "1");
  g[5][5] = "*";
  g[h - 5][6] = "O";
}

function falseTrail(g, w, h) {
  const sx = Math.floor(w * 0.48);
  const mid = (h / 2) | 0;
  fill(g, 2, 2, sx - 2, h - 4, "1");
  fill(g, sx + 1, 2, w - 3 - sx, h - 4, "1");
  shave(g, 2, 2, sx - 2, h - 4, 6);
  shave(g, sx + 1, 2, w - 3 - sx, h - 4, 6);
  g[mid][3] = "*";
  g[mid][8] = "<";
  g[mid][sx - 1] = ">";
  g[mid][sx] = "S";
  g[mid][w - 5] = "O";
}

function bottleneck(g, w, h) {
  const r1 = Math.floor(h * 0.3);
  const r2 = Math.floor(h * 0.62);
  const ax = Math.floor(w * 0.72);
  fill(g, 2, 2, w - 4, r1 - 2, "1");
  for (let x = 2; x < w - 2; x++) g[r1][x] = "R";
  fill(g, 2, r1 + 1, w - 4, r2 - r1 - 1, "1");
  g[r2 - 1][ax] = "v";
  g[r2][ax] = "S";
  fill(g, 2, r2 + 1, w - 4, h - r2 - 3, "1");
  g[4][5] = "*";
  g[h - 5][w - 6] = "O";
}

function heart(g, w, h) {
  const r1 = Math.floor(h * 0.32);
  const r2 = Math.floor(h * 0.64);
  const ax = Math.floor(w * 0.6);
  fill(g, 2, 2, w - 4, r1 - 2, "1");
  fill(g, 10, 6, 8, 4, "I");
  for (let x = 2; x < w - 2; x++) g[r1][x] = "R";
  fill(g, 2, r1 + 1, w - 4, r2 - r1 - 1, "1");
  g[r2 - 1][ax] = "v";
  g[r2][ax] = "S";
  fill(g, 2, r2 + 1, w - 4, h - r2 - 3, "1");
  g[3][5] = "*";
  g[h - 5][w - 6] = "O";
}

function fork(g, w, h) {
  const frame = 9;
  fill(g, 2, 2, w - 4, h - 4, "1");
  fill(g, frame, frame, w - frame * 2, Math.floor(h * 0.42), ".");
  const cx = (w / 2) | 0;
  fill(g, cx - 4, frame - 1, 9, h - frame - 2, "1");
  g[5][5] = "*";
  g[h - 6][cx] = "O";
}

function sluice(g, w, h, opt) {
  const sx = Math.floor(w * (opt.sx || 0.5));
  const mid = (h / 2) | 0;
  fill(g, 2, 2, sx - 8, h - 4, "1");
  shave(g, 2, 2, sx - 8, h - 4, 6);
  for (let x = sx - 8; x < sx; x++) g[mid][x] = "1";
  g[mid][sx - 7] = "-";
  g[mid][sx] = "S";
  for (let x = sx + 1; x < w - 2; x++) g[mid][x] = "1";
  fill(g, sx, mid + 1, w - 2 - sx, h - mid - 3, "1");
  g[mid][sx] = "S";
  g[mid][5] = "*";
  g[mid + 4][w - 5] = "O";
}

function upAcross(g, w, h) {
  const mid = Math.floor(h * 0.55);
  const ax = (w / 2) | 0;
  fill(g, 2, 4, w - 4, mid - 4, "1");
  g[3][ax] = "1";
  g[4][ax] = "|";
  g[mid][ax] = "S";
  fill(g, 2, mid + 1, w - 4, h - mid - 3, "1");
  g[8][5] = "*";
  g[h - 5][w - 6] = "O";
}

function cross(g, w, h) {
  const arm = 8;
  const cx = Math.floor(w * 0.38);
  const cy = (h / 2) | 0;
  const sx = w - 9;
  fill(g, cx - 3, 2, arm, h - 4, "1");
  fill(g, 2, cy - 3, sx - 2, arm, "1");
  fill(g, sx + 1, cy - 3, w - 3 - sx, arm, "1");
  g[cy][sx] = "S";
  g[cy][cx] = "+";
  g[cy][5] = "*";
  g[cy + 1][w - 5] = "O";
}

function labyrinth(g, w, h, opt) {
  const topH = Math.floor(h * 0.32);
  const topW = Math.floor(w * 0.52);
  fill(g, 2, 2, topW, topH, "1");
  if (opt.ice) fill(g, 8, 5, 6, 3, "I");
  for (let x = 2; x < 2 + topW; x++) g[2 + topH][x] = "R";
  const midY = 3 + topH;
  const midH = Math.floor(h * 0.26);
  const midX = Math.floor(w * 0.2);
  fill(g, midX, midY, w - midX - 2, midH, "1");
  const ax = w - 6;
  const vrow = midY + midH - 1;
  g[vrow][ax] = "v";
  g[vrow + 1][ax] = "S";
  const lowY = vrow + 2;
  fill(g, ax - 2, lowY, w - ax, h - lowY - 2, "1");
  g[4][4] = "*";
  g[lowY + 2][w - 5] = "O";
}

function crown(g, w, h) {
  const mid = Math.floor(h * 0.58);
  const ax = (w / 2) | 0;
  fill(g, 2, 2, w - 4, mid - 2, "1");
  shave(g, 2, 2, w - 4, mid - 2, 7);
  g[Math.max(6, (mid * 0.45) | 0)][ax] = "+";
  g[mid][ax] = "S";
  fill(g, 2, mid + 1, w - 4, h - mid - 3, "1");
  g[8][8] = "*";
  g[h - 10][(w / 2) | 0] = "O";
}

function triple(g, w, h) {
  const wx = (w / 2) | 0;
  fill(g, 2, 2, wx - 3, h - 4, "1");
  fill(g, wx + 2, 2, w - 2 - (wx + 2), h - 4, "1");
  shave(g, 2, 2, wx - 3, h - 4, 6);
  shave(g, wx + 2, 2, w - 2 - (wx + 2), h - 4, 6);
  for (let y = 2; y < h - 2; y++) {
    g[y][wx - 1] = "3";
    g[y][wx] = "3";
    g[y][wx + 1] = "3";
  }
  const sy = (h / 2) | 0;
  g[sy][5] = "*";
  g[sy][w - 6] = "O";
}

function snake(g, w, h) {
  const t = 9;
  const gap = 4;
  const lanes = [2, 2 + t + gap, 2 + 2 * (t + gap)];
  for (const y of lanes) fill(g, 2, y, w - 4, t, "1");
  fill(g, w - 2 - t, lanes[0], t, lanes[1] + t - lanes[0], "1");
  fill(g, 2, lanes[1], t, lanes[2] + t - lanes[1], "1");
  g[lanes[0] + 3][5] = "*";
  g[lanes[2] + 3][w - 6] = "O";
}

function levee(g, w, h) {
  const r1 = Math.floor(h * 0.28);
  const r2 = Math.floor(h * 0.68);
  const ax = Math.floor(w * 0.66);
  fill(g, 2, 2, w - 4, r1 - 2, "1");
  for (let x = 2; x < w - 2; x++) g[r1][x] = "R";
  fill(g, 2, r1 + 1, w - 4, r2 - r1 - 1, "2");
  g[r2 - 1][ax] = "v";
  g[r2][ax] = "S";
  fill(g, 2, r2 + 1, w - 4, h - r2 - 3, "1");
  g[4][5] = "*";
  g[h - 5][w - 6] = "O";
}

function tide(g, w, h) {
  const r1 = Math.floor(h * 0.28);
  const r2 = Math.floor(h * 0.52);
  const ax = Math.floor(w * 0.62);
  fill(g, 2, 2, w - 4, r1 - 2, "1");
  fill(g, 12, 5, 7, 3, "I");
  for (let x = 2; x < w - 2; x++) g[r1][x] = "R";
  fill(g, 2, r1 + 1, w - 4, r2 - r1 - 1, "1");
  g[r2 - 1][ax] = "v";
  g[r2][ax] = "S";
  fill(g, 2, r2 + 1, w - 4, 2, "3");
  fill(g, 2, r2 + 3, w - 4, h - (r2 + 3) - 2, "1");
  g[3][5] = "*";
  g[h - 4][w - 6] = "O";
}

const BUILDERS = {
  cavern,
  bend,
  splitV,
  splitH,
  neck,
  iceBridge,
  iceFloor,
  arrowDown,
  volley,
  falseTrail,
  bottleneck,
  heart,
  fork,
  sluice,
  upAcross,
  cross,
  labyrinth,
  crown,
  triple,
  snake,
  levee,
  tide,
};

export function buildMap(kind, w, h, opt = {}) {
  const g = blank(w, h);
  BUILDERS[kind](g, w, h, opt);
  return lines(g);
}
