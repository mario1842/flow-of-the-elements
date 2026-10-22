import { buildMap } from "./maps.js";

const FOUR = ["earth", "fire", "air", "water"];
const SPADE = ["spade"];
const FIRE = ["spade", "bomb"];
const AIR = ["spade", "bomb", "swap"];
const WATER = ["spade", "bomb", "swap", "shuffle"];

const GEM = { e: "earth", f: "fire", a: "air", w: "water" };
const ICE = { g: "earth", h: "fire", j: "air", k: "water" };
const ARROWS = {
  "^": ["up"],
  v: ["down"],
  "<": ["left"],
  ">": ["right"],
  "-": ["left", "right"],
  "|": ["up", "down"],
  "+": ["up", "down", "left", "right"],
};

export const BOOKS = [
  {
    id: "earth",
    name: "Book of Earth",
    element: "Earth",
    hue: "#86c56a",
    line: "Open the first book and teach the earth to carry the current again.",
  },
  {
    id: "fire",
    name: "Book of Fire",
    element: "Fire",
    hue: "#ff7a45",
    line: "The altars have gone cold. Light a path before the spark dies.",
  },
  {
    id: "air",
    name: "Book of Air",
    element: "Air",
    hue: "#ffd056",
    line: "The wind lost the trail. Lay it again between the cliffs.",
  },
  {
    id: "water",
    name: "Book of Water",
    element: "Water",
    hue: "#49c6f2",
    line: "The last current waits under the ice. Carry it to the heart of the deep.",
  },
];

function cell(partial) {
  return {
    ground: 0,
    kind: "empty",
    color: null,
    dirs: null,
    fired: false,
    energized: false,
    flowOrder: 0,
    ...partial,
  };
}

function gem(level, rng, ground, color) {
  const palette = level.colors;
  return cell({
    ground,
    kind: "gem",
    color: color ?? palette[(rng() * palette.length) | 0],
  });
}

export function parseLevel(level, rng) {
  const grid = level.grid;
  const height = grid.length;
  const width = grid[0].length;
  const cells = [];
  let source = null;
  let altar = null;
  for (let y = 0; y < height; y++) {
    if (grid[y].length !== width) throw new Error(`${level.id}: nierówny wiersz ${y}`);
    for (let x = 0; x < width; x++) {
      const ch = grid[y][x];
      let made = null;
      if (ch === ".") made = cell({ kind: "void" });
      else if (ch === "0") made = cell({ kind: "channel" });
      else if (ch === "1" || ch === "2" || ch === "3") made = gem(level, rng, Number(ch));
      else if (GEM[ch]) made = gem(level, rng, 1, GEM[ch]);
      else if (ch === "R") made = cell({ kind: "stone", ground: 1 });
      else if (ch === "r") made = cell({ kind: "stone" });
      else if (ch === "I") made = gem(level, rng, 1);
      else if (ICE[ch]) made = cell({ kind: "ice", ground: 1, color: ICE[ch] });
      else if (ch === "S") made = cell({ kind: "slab", ground: 1 });
      else if (ARROWS[ch]) made = cell({ kind: "arrow", dirs: [...ARROWS[ch]] });
      else if (ch === "*") {
        made = cell({ kind: "source", energized: true });
        source = { x, y };
      } else if (ch === "O") {
        made = cell({ kind: "altar" });
        altar = { x, y };
      }
      if (!made) throw new Error(`${level.id}: zły znak "${ch}" na ${x},${y}`);
      if (ch === "I") made.kind = "ice";
      if (made.kind === "ice") made.frost = 2;
      cells.push(made);
    }
  }
  if (!source || !altar) throw new Error(`${level.id}: brak źródła albo ołtarza`);
  return { w: width, h: height, cells, source, altar };
}

function L(book, n, spec) {
  return {
    id: `${book}-${n}`,
    book,
    n,
    name: spec.name,
    time: spec.time,
    powers: spec.powers,
    prime: spec.prime || [],
    colors: spec.colors,
    tip: spec.tip || "",
    grid: spec.grid,
  };
}

const board = (kind, w, h, opt) => buildMap(kind, w, h, opt);

const earth = [
  L("earth", 1, {
    name: "First Trench",
    time: 420,
    powers: [],
    colors: FOUR,
    tip: "Hold a gem and drag across at least three of the same color. The ground beneath them disappears. Drag an empty cell to look around, or scroll to zoom in.",
    grid: board("cavern", 52, 38, { salt: 1 }),
  }),
  L("earth", 2, {
    name: "The Bend",
    time: 440,
    powers: [],
    colors: FOUR,
    tip: "The current flows only up, down, left, and right. A tunnel can turn.",
    grid: board("bend", 54, 40),
  }),
  L("earth", 3, {
    name: "Long Chain",
    time: 460,
    powers: [],
    colors: FOUR,
    tip: "Five gems make a small blast at the end of the chain. Six and seven make it wider.",
    grid: board("cavern", 62, 36, { salt: 4 }),
  }),
  L("earth", 4, {
    name: "Boulder in the Way",
    time: 480,
    powers: [],
    colors: FOUR,
    tip: "A boulder cannot join a chain. A blast of five or more gems breaks it.",
    grid: board("splitV", 52, 38, { salt: 1 }),
  }),
  L("earth", 5, {
    name: "Two Boulders",
    time: 520,
    powers: [],
    colors: FOUR,
    grid: board("splitH", 50, 44, { walls: 2 }),
  }),
  L("earth", 6, {
    name: "Spade",
    time: 440,
    powers: SPADE,
    prime: ["spade"],
    colors: FOUR,
    tip: "The spade charges with green. It clears one cell, ground included, even where you cannot make a chain.",
    grid: board("neck", 52, 38),
  }),
  L("earth", 7, {
    name: "Frost",
    time: 480,
    powers: SPADE,
    colors: FOUR,
    tip: "An icy gem joins a chain of its color. The first hit turns it into an ordinary gem. The second hit breaks that gem and digs.",
    grid: board("iceBridge", 54, 38, { gap: 8, iceH: 5 }),
  }),
  L("earth", 8, {
    name: "Thick Earth",
    time: 500,
    powers: SPADE,
    colors: FOUR,
    tip: "Darker ground with two dots needs two digs.",
    grid: board("cavern", 50, 40, { ch: "2", salt: 6 }),
  }),
];

const fire = [
  L("fire", 1, {
    name: "Bomb",
    time: 480,
    powers: FIRE,
    prime: ["bomb"],
    colors: FOUR,
    tip: "The bomb charges with red. It destroys gems, ice, and boulders, but it does not dig.",
    grid: board("splitV", 56, 36, { salt: 4 }),
  }),
  L("fire", 2, {
    name: "Spark",
    time: 500,
    powers: FIRE,
    colors: FOUR,
    tip: "When the current touches a launcher, the arrow flies that way, digs, and breaks a slab.",
    grid: board("arrowDown", 52, 42, { ax: 0.55, top: 0.46 }),
  }),
  L("fire", 3, {
    name: "Volley",
    time: 500,
    powers: FIRE,
    colors: FOUR,
    tip: "An arrow that hits another launcher sets it off.",
    grid: board("volley", 54, 40, { ax: 0.88 }),
  }),
  L("fire", 4, {
    name: "Stone Slab",
    time: 500,
    powers: FIRE,
    colors: FOUR,
    tip: "Only an arrow removes a stone slab. The spade and the bomb leave it.",
    grid: board("arrowDown", 58, 36, { ax: 0.74, top: 0.42 }),
  }),
  L("fire", 5, {
    name: "False Trail",
    time: 520,
    powers: FIRE,
    colors: FOUR,
    tip: "Not every arrow leads to the altar.",
    grid: board("falseTrail", 54, 38),
  }),
  L("fire", 6, {
    name: "Bottleneck",
    time: 540,
    powers: FIRE,
    colors: FOUR,
    grid: board("bottleneck", 52, 46),
  }),
  L("fire", 7, {
    name: "Double Arc",
    time: 520,
    powers: FIRE,
    colors: FOUR,
    grid: board("volley", 50, 42, { ax: 0.7 }),
  }),
  L("fire", 8, {
    name: "Heart of Fire",
    time: 560,
    powers: FIRE,
    colors: FOUR,
    grid: board("heart", 54, 44),
  }),
];

const air = [
  L("air", 1, {
    name: "Swap",
    time: 500,
    powers: AIR,
    prime: ["swap"],
    colors: FOUR,
    tip: "Swap charges with yellow. Pick two ordinary gems. They do not have to touch.",
    grid: board("splitV", 52, 40, { salt: 8 }),
  }),
  L("air", 2, {
    name: "The Fork",
    time: 480,
    powers: AIR,
    colors: FOUR,
    tip: "Two paths lead to the altar. The shorter one leaves more time.",
    grid: board("fork", 56, 42),
  }),
  L("air", 3, {
    name: "Two Ways",
    time: 520,
    powers: AIR,
    colors: FOUR,
    tip: "A double launcher fires both ways. Not every side leads to the altar.",
    grid: board("sluice", 54, 40, { sx: 0.46 }),
  }),
  L("air", 4, {
    name: "Up and Across",
    time: 520,
    powers: AIR,
    colors: FOUR,
    tip: "A vertical launcher fires up and down.",
    grid: board("upAcross", 50, 46),
  }),
  L("air", 5, {
    name: "Crossfire",
    time: 540,
    powers: AIR,
    colors: FOUR,
    tip: "The cross fires in four directions at once.",
    grid: board("cross", 56, 42),
  }),
  L("air", 6, {
    name: "Tall Shaft",
    time: 580,
    powers: AIR,
    colors: FOUR,
    tip: "This board is taller than the window. Drag an empty cell, or use the arrow keys.",
    grid: board("splitH", 46, 56, { walls: 1 }),
  }),
  L("air", 7, {
    name: "Twisting Wind",
    time: 540,
    powers: AIR,
    colors: FOUR,
    grid: board("labyrinth", 54, 46, { ice: true }),
  }),
  L("air", 8, {
    name: "Crown of Air",
    time: 540,
    powers: AIR,
    colors: FOUR,
    grid: board("crown", 52, 42),
  }),
];

const water = [
  L("water", 1, {
    name: "Shuffle",
    time: 520,
    powers: WATER,
    prime: ["shuffle"],
    colors: FOUR,
    tip: "Shuffle charges with blue and rearranges the ordinary gems.",
    grid: board("splitH", 54, 40, { walls: 1, ch: "1" }),
  }),
  L("water", 2, {
    name: "The Deep",
    time: 540,
    powers: WATER,
    colors: FOUR,
    tip: "Three dots mean three digs in the same cell.",
    grid: board("triple", 52, 38),
  }),
  L("water", 3, {
    name: "Cold Current",
    time: 520,
    powers: WATER,
    colors: FOUR,
    tip: "Ice stays put. The first hit turns it into an ordinary gem. The second hit breaks that gem.",
    grid: board("iceFloor", 50, 42),
  }),
  L("water", 4, {
    name: "The Sluice",
    time: 540,
    powers: WATER,
    colors: FOUR,
    tip: "One side of the launcher opens the sluice. The other ends in a dead wall.",
    grid: board("sluice", 58, 40, { sx: 0.58 }),
  }),
  L("water", 5, {
    name: "Labyrinth",
    time: 560,
    powers: WATER,
    colors: FOUR,
    grid: board("labyrinth", 56, 48, {}),
  }),
  L("water", 6, {
    name: "Tight Time",
    time: 320,
    powers: WATER,
    colors: FOUR,
    tip: "Time matters here. Leave as much as you can if you want three stars.",
    grid: board("snake", 54, 42),
  }),
  L("water", 7, {
    name: "Last Levee",
    time: 580,
    powers: WATER,
    colors: FOUR,
    grid: board("levee", 52, 46),
  }),
  L("water", 8, {
    name: "Tide Altar",
    time: 620,
    powers: WATER,
    colors: FOUR,
    tip: "The last altar. Carry the current all the way.",
    grid: board("tide", 58, 48),
  }),
];

export const LEVELS = [...earth, ...fire, ...air, ...water];
LEVELS.forEach((level, index) => {
  level.index = index;
});

for (const level of LEVELS) {
  const chars = level.grid.join("");
  if ((chars.match(/\*/g) || []).length !== 1 || (chars.match(/O/g) || []).length !== 1) {
    throw new Error(`${level.id}: źródło albo ołtarz`);
  }
}

export function bookOf(id) {
  return BOOKS.find((book) => book.id === id);
}
