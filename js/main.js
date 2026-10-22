import { CHARGE_MAX, POWERS } from "./board.js";
import { createAudio } from "./audio.js";
import {
  commitBomb,
  commitChain,
  commitShuffle,
  commitSpade,
  commitSwap,
  createSession,
  pauseSession,
  resumeSession,
  tick,
} from "./flow.js";
import { createGestures } from "./input.js";
import { BOOKS, LEVELS, bookOf } from "./levels.js";
import {
  burst,
  drawBoard,
  drawMinimap,
  fitCanvas,
  focusCamera,
  gemColor,
  layoutBoard,
  resetFx,
  stepFx,
} from "./render.js";
import { loadSave, recordWin, resetSave, starsFor } from "./save.js";

const app = document.querySelector("#app");
const audio = createAudio();
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function isLocalHost(host = location.hostname) {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return true;
  if (host.endsWith(".local")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168)) return true;
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

function readDebug() {
  return isLocalHost() && location.hash === "#debug";
}

let save = loadSave();
let debug = readDebug();
let screen = "title";
let session = null;
let dialog = null;
let shellKey = "";
let veilDirty = true;
let resumeAfterRules = false;
let last = performance.now();
let boardZoom = 1;

const gestures = createGestures({
  chain(path) {
    commitChain(session, path);
  },
  spade(x, y) {
    return commitSpade(session, x, y);
  },
  bomb(x, y) {
    return commitBomb(session, x, y);
  },
  swap(a, b) {
    return commitSwap(session, a, b);
  },
  tick(n) {
    audio.play("tick", n);
  },
  deny() {
    audio.play("deny");
  },
});

function star(on) {
  return `<svg class="star ${on ? "on" : ""}" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8 12.4 7l5.6.5-4.3 3.6 1.3 5.4L10 13.8 5 16.5l1.3-5.4L2 7.5 7.6 7z"/></svg>`;
}

function starRow(count, big = false) {
  const html = [1, 2, 3].map((i) => star(i <= count)).join("");
  return big ? `<div class="stars" aria-label="${count} of 3 stars">${html}</div>` : `<span class="mini">${html}</span>`;
}

function fmt(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function veil() {
  return `<div class="veil" id="veil" hidden><div class="dialog" role="dialog" aria-modal="true"><p class="kicker" id="d-kicker"></p><h2 id="d-title"></h2><div id="d-body"></div><div class="actions" id="d-actions"></div></div></div>`;
}

function titleHtml() {
  const played = save.unlocked > 0 || Object.keys(save.stars).length > 0;
  return `<section class="screen title">
    <div class="title-wrap">
      <div class="medallions" aria-hidden="true">
        <i class="med earth"></i><i class="med fire"></i><i class="med air"></i><i class="med water"></i>
      </div>
      <p class="kicker">four books · one current</p>
      <h1>Flow of the Elements</h1>
      <p class="lead">The four elemental altars have gone dark, and only a dry passage remains underground. Link the gems, dig a tunnel, and bring the current back to the altar.</p>
      <div class="title-actions">
        <button class="primary" data-act="map">${played ? "Continue" : "Start"}</button>
        <button data-act="rules">How to play</button>
        ${played ? `<button data-act="reset-ask">Start over</button>` : ""}
      </div>
      <p class="fine">An original game inspired by a classic puzzle. No borrowed art, and no minigames.</p>
    </div>
    <nav class="also" aria-label="Other games">
      <a href="https://mario1842.github.io/winnable-mahjong/" target="_blank" rel="noopener noreferrer">
        <img src="https://mario1842.github.io/winnable-mahjong/favicon.svg" alt="" width="25" height="25">
        Winnable Mahjong
      </a>
      <a href="https://mario1842.github.io/winnable-solitaire/" target="_blank" rel="noopener noreferrer">
        <img src="https://mario1842.github.io/winnable-solitaire/favicon.svg" alt="" width="25" height="25">
        Winnable Solitaire
      </a>
      <a href="https://mario1842.github.io/winnable-minesweeper/" target="_blank" rel="noopener noreferrer">
        <img src="https://mario1842.github.io/winnable-minesweeper/favicon.svg" alt="" width="25" height="25">
        Winnable Minesweeper
      </a>
    </nav>
    ${veil()}
  </section>`;
}

function mapHtml() {
  const books = BOOKS.map((book) => {
    const nodes = LEVELS.filter((level) => level.book === book.id)
      .map((level) => {
        const locked = !debug && level.index > save.unlocked;
        const stars = save.stars[level.id] || 0;
        const current = level.index === save.unlocked ? "current" : "";
        return `<li>
          <button class="node ${locked ? "locked" : ""} ${current}" data-act="level" data-index="${level.index}" ${locked ? "disabled" : ""} aria-label="${level.name}, ${stars} of 3 stars">
            <span class="num">${level.n}</span>${starRow(stars)}
          </button>
          <span class="node-name">${level.name}</span>
        </li>`;
      })
      .join("");
    return `<section class="book" style="--accent:${book.hue}"><h2>${book.name}</h2><p>${book.line}</p><ol class="path">${nodes}</ol></section>`;
  }).join("");
  const done = LEVELS.every((level) => (save.stars[level.id] || 0) > 0);
  return `<section class="screen map">
    <header class="map-head">
      <div><p class="kicker">campaign</p><h1>Four Books</h1></div>
      <div class="actions">
        <button data-act="title">Title</button>
        <button data-act="rules">How to play</button>
      </div>
    </header>
    ${debug ? `<p class="tip">Local debug. Every level is open on this computer.</p>` : ""}
    ${done ? `<p class="tip">Every altar carries the current again.</p>` : ""}
    <div class="map-grid">${books}</div>
    ${veil()}
  </section>`;
}

function playHtml() {
  const book = bookOf(session.level.book);
  const powers = POWERS.filter((power) => session.level.powers.includes(power.id));
  const powerHtml = powers.length
    ? powers
        .map(
          (power) => `<button class="power" data-act="power" data-power="${power.id}" style="--pip:${gemColor(power.color)}">
            <i class="pip" style="background:${gemColor(power.color)}"></i>
            <span class="who"><strong>${power.name}</strong><small>${power.hint}</small></span>
            <span class="meter" aria-hidden="true"><span></span></span>
          </button>`,
        )
        .join("")
    : `<p class="none-powers">This level is chains only.</p>`;
  return `<section class="screen play" data-book="${book.id}">
    <header class="top">
      <button data-act="map">Map</button>
      <div class="titles">
        <p class="eyebrow">${book.name} · ${session.level.n}/8${debug ? " · debug" : ""}</p>
        <h1>${session.level.name}</h1>
      </div>
      <div class="top-actions">
        <button data-act="rules">How to play</button>
        <button data-act="restart">Restart</button>
        <button data-act="pause">Pause</button>
        <button data-act="mute" id="mute">Mute</button>
      </div>
    </header>
    ${session.level.tip ? `<p class="tip">${session.level.tip}</p>` : ""}
    <div class="stage">
      <div class="board-wrap">
        <canvas id="board"></canvas>
        <p class="toast" id="toast" hidden></p>
      </div>
      <aside>
        <div class="vial" id="vial" title="Time"><div class="vial-fill" id="vial-fill"></div></div>
        <p class="time-num" id="time">0:00</p>
        <p class="score-label">Score</p>
        <p class="score-num" id="score">0</p>
        <canvas id="minimap" width="180" height="120" aria-label="Minimap"></canvas>
        <p class="caption">The light frame is the source. The gold frame is the altar.</p>
        <div class="pans" id="pans" hidden>
          <button data-act="pan" data-y="-80" aria-label="Up">↑</button>
          <button data-act="pan" data-y="80" aria-label="Down">↓</button>
          <button data-act="pan" data-x="-80" aria-label="Left">←</button>
          <button data-act="pan" data-x="80" aria-label="Right">→</button>
        </div>
      </aside>
    </div>
    <div class="powers">${powerHtml}</div>
    ${veil()}
  </section>`;
}

function ensureShell() {
  const key = `${screen}:${session?.level.id || ""}`;
  if (key === shellKey) return;
  shellKey = key;
  app.innerHTML = screen === "title" ? titleHtml() : screen === "map" ? mapHtml() : playHtml();
  veilDirty = true;
}

function paintDialog() {
  const kicker = document.getElementById("d-kicker");
  const title = document.getElementById("d-title");
  const body = document.getElementById("d-body");
  const actions = document.getElementById("d-actions");
  if (!kicker) return;
  veilDirty = false;
  if (!dialog) return;
  if (dialog === "rules") {
    kicker.textContent = "how to play";
    title.textContent = "How to play";
    body.innerHTML = `<ul>
      <li>Link at least three gems of the same color, up, down, left, or right.</li>
      <li>The ground under them vanishes. The current flows through the dug tunnel to the altar.</li>
      <li>Five gems blast a cross, six a larger square, seven or more a wider one.</li>
      <li>Ice takes two hits. The first turns it into an ordinary gem. The second breaks that gem and digs. A blast, bomb, spade, or arrow counts as one hit. Only an arrow breaks a slab.</li>
      <li>Green charges the spade, red the bomb, yellow swap, blue shuffle. The bomb does not dig.</li>
      <li>Time passes between moves. Time left becomes points and stars.</li>
      <li>Keys 1–4 choose powers, Esc pauses, and the arrow keys pan a large board. Scroll over the board to zoom.</li>
    </ul>`;
    actions.innerHTML = `<button class="primary" data-act="close-rules">Got it</button>`;
  } else if (dialog === "pause") {
    kicker.textContent = "paused";
    title.textContent = "Pause";
    body.innerHTML = `<p>Time is stopped. The board will wait.</p>`;
    actions.innerHTML = `<button class="primary" data-act="resume">Resume</button><button data-act="restart">Restart</button><button data-act="map">Map</button>`;
  } else if (dialog === "lose") {
    kicker.textContent = session.level.name;
    title.textContent = "Time's up";
    body.innerHTML = `<p>The current never reached the altar. Try a shorter path or a longer chain.</p>`;
    actions.innerHTML = `<button class="primary" data-act="restart">Try again</button><button data-act="map">Map</button>`;
  } else if (dialog === "win") {
    const lastLevel = session.level.index === LEVELS.length - 1;
    const total = session.score + session.timeBonus;
    kicker.textContent = lastLevel ? "campaign complete" : bookOf(session.level.book).name;
    title.textContent = lastLevel ? "The four books breathe again" : "The altar wakes";
    body.innerHTML = `${starRow(session.stars || 1, true)}
      <p>Chains and blasts: <strong>${session.score.toLocaleString("en-US")}</strong></p>
      <p>Time bonus (${fmt(session.time)}): <strong>${session.timeBonus.toLocaleString("en-US")}</strong></p>
      <p>Total: <strong>${total.toLocaleString("en-US")}</strong></p>`;
    actions.innerHTML = `${lastLevel ? "" : `<button class="primary" data-act="next">Next</button>`}
      <button data-act="restart">Replay</button><button data-act="map">Map</button>`;
  } else if (dialog === "reset") {
    kicker.textContent = "save";
    title.textContent = "Start from the first book?";
    body.innerHTML = `<p>Stars and unlocked levels will disappear from this browser.</p>`;
    actions.innerHTML = `<button class="primary" data-act="reset-yes">Erase save</button><button data-act="close">Keep</button>`;
  }
  document.getElementById("veil").hidden = false;
}

function show(next) {
  screen = next;
  dialog = null;
  shellKey = "";
}

function beginLevel(index) {
  const level = LEVELS[index];
  if (!level || (!debug && index > save.unlocked)) return;
  session = createSession(level, (Math.random() * 0xffffffff) >>> 0);
  session.zoom = boardZoom;
  session.reduceMotion = reduceMotion;
  resetFx();
  gestures.reset();
  dialog = null;
  screen = "play";
  shellKey = "";
}

function openRules() {
  resumeAfterRules = false;
  if (screen === "play" && session && (session.phase === "play" || session.phase === "anim")) {
    pauseSession(session);
    resumeAfterRules = true;
  }
  dialog = "rules";
  veilDirty = true;
}

function closeRules() {
  if (resumeAfterRules && session) {
    resumeSession(session);
    resumeAfterRules = false;
  }
  dialog = null;
  veilDirty = true;
}

function toggleArm(id) {
  if (!session || session.phase !== "play") return;
  if (!session.level.powers.includes(id)) return;
  if (session.charges[id] < CHARGE_MAX) {
    audio.play("deny");
    document.querySelector(`[data-power="${id}"]`)?.classList.add("deny");
    window.setTimeout(() => document.querySelector(`[data-power="${id}"]`)?.classList.remove("deny"), 280);
    return;
  }
  if (id === "shuffle") {
    commitShuffle(session);
    return;
  }
  session.swapPick = null;
  session.armed = session.armed === id ? null : id;
  audio.play("ui");
}

function onClick(event) {
  const button = event.target.closest("[data-act]");
  if (!button || button.disabled) return;
  audio.unlock();
  const act = button.dataset.act;
  if (act === "map") show("map");
  else if (act === "title") show("title");
  else if (act === "rules") openRules();
  else if (act === "close-rules") closeRules();
  else if (act === "close") {
    dialog = null;
    veilDirty = true;
  } else if (act === "reset-ask") {
    dialog = "reset";
    veilDirty = true;
  } else if (act === "reset-yes") {
    save = resetSave();
    show("title");
  } else if (act === "level") beginLevel(Number(button.dataset.index));
  else if (act === "restart" && session) beginLevel(session.level.index);
  else if (act === "next" && session) beginLevel(session.level.index + 1);
  else if (act === "pause") pauseSession(session);
  else if (act === "resume") {
    resumeSession(session);
    dialog = null;
    veilDirty = true;
  } else if (act === "mute") audio.toggle();
  else if (act === "power") toggleArm(button.dataset.power);
  else if (act === "pan" && session) {
    session.cam.x += Number(button.dataset.x || 0);
    session.cam.y += Number(button.dataset.y || 0);
  }
}

function boardCanvas() {
  return document.getElementById("board");
}

function onPointerDown(event) {
  audio.unlock();
  const map = event.target.closest("#minimap");
  const canvas = boardCanvas();
  if (map && session && canvas && !dialog) {
    const rect = map.getBoundingClientRect();
    const boardRect = canvas.getBoundingClientRect();
    const lay = layoutBoard(session, boardRect.width, boardRect.height);
    const wx = ((event.clientX - rect.left) / rect.width) * (session.w * lay.cell);
    const wy = ((event.clientY - rect.top) / rect.height) * (session.h * lay.cell);
    session.cam.x = wx - lay.availW / 2;
    session.cam.y = wy - lay.availH / 2;
    return;
  }
  if (!canvas || event.target !== canvas || !session || dialog) return;
  if (event.cancelable) event.preventDefault();
  gestures.down(event, session, canvas);
}

function onPointerMove(event) {
  const canvas = boardCanvas();
  if (!canvas || !session || screen !== "play") return;
  gestures.move(event, session, canvas);
}

function onPointerUp(event) {
  if (!session) return;
  gestures.up(event, session);
}

function onKey(event) {
  if (event.repeat) return;
  if (event.key === "Escape") {
    if (dialog === "rules") closeRules();
    else if (dialog === "pause") {
      resumeSession(session);
      dialog = null;
      veilDirty = true;
    } else if (dialog === "reset") {
      dialog = null;
      veilDirty = true;
    } else if (screen === "play" && session && (session.phase === "play" || session.phase === "anim")) {
      pauseSession(session);
    }
    return;
  }
  if (screen !== "play" || !session || dialog) return;
  if (event.key >= "1" && event.key <= "4") {
    const power = ["spade", "bomb", "swap", "shuffle"][Number(event.key) - 1];
    toggleArm(power);
    return;
  }
  const pan = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] }[event.key];
  if (!pan) return;
  session.cam.x += pan[0];
  session.cam.y += pan[1];
  event.preventDefault();
}

function watchPhase() {
  if (!session || screen !== "play") return;
  if (session.phase === "win" && dialog !== "win") {
    if (!session.saved) {
      session.saved = true;
      session.stars = starsFor(session.time, session.level.time);
      recordWin(save, session.level, session.stars, session.time);
    }
    dialog = "win";
    veilDirty = true;
  } else if (session.phase === "lose" && dialog !== "lose") {
    dialog = "lose";
    veilDirty = true;
    audio.play("lose");
  } else if (session.phase === "paused" && dialog !== "pause" && dialog !== "rules") {
    dialog = "pause";
    veilDirty = true;
  }
}

function hear(now) {
  if (!session?.anim) return;
  const mark = `${session.level.id}:${session.qi}:${session.anim.ev.type}`;
  if (session.soundMark === mark) return;
  session.soundMark = mark;
  audio.playEvent(session.anim.ev);
  if (session.anim.ev.text) {
    session.toast = session.anim.ev.text;
    session.toastUntil = now + 2400;
  }
  const color = gemColor(session.level.book);
  const spots = [
    ...(session.anim.ev.ghosts || []),
    ...(session.anim.ev.blastGhosts || []),
    ...(session.anim.ev.shot?.affected || []),
  ];
  for (const spot of spots.slice(0, 14)) burst(spot.x + 0.5, spot.y + 0.5, color, 4);
}

function syncHud(now) {
  const veilNode = document.getElementById("veil");
  if (veilDirty) paintDialog();
  if (veilNode) veilNode.hidden = !dialog;
  if (screen !== "play" || !session) return;
  const ratio = session.level.time > 0 ? session.time / session.level.time : 0;
  const fill = document.getElementById("vial-fill");
  const vial = document.getElementById("vial");
  if (fill) fill.style.height = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  vial?.classList.toggle("danger", ratio < 0.2 && ratio > 0);
  const time = document.getElementById("time");
  if (time) time.textContent = fmt(session.time);
  const score = document.getElementById("score");
  if (score) score.textContent = session.score.toLocaleString("en-US");
  const mute = document.getElementById("mute");
  if (mute) mute.textContent = audio.muted() ? "Sound on" : "Mute";
  for (const button of document.querySelectorAll(".power")) {
    const id = button.dataset.power;
    const value = (session.charges[id] || 0) / CHARGE_MAX;
    const bar = button.querySelector(".meter > span");
    if (bar) bar.style.width = `${Math.min(1, value) * 100}%`;
    button.classList.toggle("ready", value >= 1);
    button.classList.toggle("armed", session.armed === id);
    button.disabled = session.phase !== "play";
    button.setAttribute("aria-pressed", session.armed === id ? "true" : "false");
  }
  const toast = document.getElementById("toast");
  if (toast) {
    const visible = session.toast && now < session.toastUntil;
    toast.hidden = !visible;
    if (visible) toast.textContent = session.toast;
  }
  const pans = document.getElementById("pans");
  if (pans && session.layout) pans.hidden = !session.layout.overflow;
  const canvas = boardCanvas();
  if (canvas) {
    if (session.armed) canvas.style.cursor = "crosshair";
    else if (session.chain?.length) canvas.style.cursor = "pointer";
    else if (session.layout?.overflow) canvas.style.cursor = "grab";
    else canvas.style.cursor = "pointer";
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (session && screen === "play") {
    tick(session, dt);
    stepFx(dt);
    watchPhase();
    hear(now);
  }
  ensureShell();
  if (session && screen === "play") {
    const canvas = boardCanvas();
    if (canvas) {
      const fitted = fitCanvas(canvas);
      if (fitted.ctx) {
        if (!session.camReady) {
          focusCamera(session, fitted.w, fitted.h);
          session.camReady = true;
        }
        drawBoard(fitted.ctx, session, fitted.w, fitted.h, now);
        const map = document.getElementById("minimap");
        if (map) {
          const mini = fitCanvas(map);
          if (mini.ctx) drawMinimap(mini.ctx, session, mini.w, mini.h);
        }
      }
    }
  }
  syncHud(now);
  requestAnimationFrame(frame);
}

app.addEventListener("click", onClick);
app.addEventListener("pointerdown", onPointerDown);
app.addEventListener("pointermove", onPointerMove);
app.addEventListener("pointerup", onPointerUp);
app.addEventListener("pointercancel", onPointerUp);
app.addEventListener("contextmenu", (event) => {
  if (event.target.closest("#board")) event.preventDefault();
});
function onWheel(event) {
  if (!session || screen !== "play") return;
  if (!event.target.closest?.("#board")) return;
  const canvas = boardCanvas();
  if (!canvas) return;
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const before = layoutBoard(session, rect.width, rect.height);
  const worldX = (localX - before.originX) / before.cell;
  const worldY = (localY - before.originY) / before.cell;
  let delta = event.deltaY;
  if (event.deltaMode === 1) delta *= 16;
  else if (event.deltaMode === 2) delta *= rect.height;
  session.zoom = Math.min(2.6, Math.max(0.75, (session.zoom || 1) * Math.exp(-delta * 0.0016)));
  boardZoom = session.zoom;
  const next = layoutBoard(session, rect.width, rect.height);
  session.cam.x = worldX * next.cell - localX + next.pad;
  session.cam.y = worldY * next.cell - localY + next.pad;
  layoutBoard(session, rect.width, rect.height);
}

window.addEventListener("wheel", onWheel, { passive: false });
window.addEventListener("keydown", onKey);
window.addEventListener("hashchange", () => {
  const next = readDebug();
  if (next === debug) return;
  debug = next;
  shellKey = "";
});
requestAnimationFrame(frame);
