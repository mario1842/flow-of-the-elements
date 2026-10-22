import { get, isMatchable } from "./board.js";
import { cellAt } from "./render.js";

function same(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

export function createGestures(actions) {
  let mode = null;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;

  function local(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, w: rect.width, h: rect.height };
  }

  function reset() {
    mode = null;
    pointerId = null;
  }

  function down(event, session, canvas) {
    if (session.phase !== "play") return;
    const pos = local(canvas, event);
    const hit = cellAt(session, pos.w, pos.h, pos.x, pos.y);
    session.hover = hit.cell;
    if (event.button === 1 || event.button === 2) {
      mode = "pan";
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const cell = hit.cell;
    if (session.armed === "spade" && cell) {
      if (!actions.spade(cell.x, cell.y)) actions.deny();
      return;
    }
    if (session.armed === "bomb" && cell) {
      if (!actions.bomb(cell.x, cell.y)) actions.deny();
      return;
    }
    if (session.armed === "swap" && cell) {
      const target = get(session, cell.x, cell.y);
      if (target.kind !== "gem") {
        actions.deny();
        return;
      }
      if (!session.swapPick) {
        session.swapPick = { x: cell.x, y: cell.y };
        actions.tick(1);
        return;
      }
      if (same(session.swapPick, cell)) {
        session.swapPick = null;
        return;
      }
      const first = session.swapPick;
      if (!actions.swap(first, cell)) actions.deny();
      return;
    }
    if (cell && isMatchable(get(session, cell.x, cell.y))) {
      session.chain = [{ x: cell.x, y: cell.y }];
      mode = "chain";
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      actions.tick(1);
      return;
    }
    if (hit.lay.overflow) {
      mode = "pan";
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    }
  }

  function move(event, session, canvas) {
    const pos = local(canvas, event);
    const hit = cellAt(session, pos.w, pos.h, pos.x, pos.y);
    session.hover = hit.cell;
    if (pointerId !== event.pointerId) return;
    if (mode === "pan") {
      session.cam.x -= event.clientX - lastX;
      session.cam.y -= event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      return;
    }
    if (mode !== "chain" || !hit.cell) return;
    const cell = hit.cell;
    const index = session.chain.findIndex((point) => point.x === cell.x && point.y === cell.y);
    if (index >= 0) {
      if (index < session.chain.length - 1) session.chain = session.chain.slice(0, index + 1);
      return;
    }
    const tail = session.chain[session.chain.length - 1];
    if (Math.abs(tail.x - cell.x) + Math.abs(tail.y - cell.y) !== 1) return;
    const next = get(session, cell.x, cell.y);
    const prev = get(session, tail.x, tail.y);
    if (!isMatchable(next) || next.color !== prev.color) return;
    session.chain.push({ x: cell.x, y: cell.y });
    actions.tick(session.chain.length);
  }

  function up(event, session) {
    if (pointerId !== event.pointerId) return;
    if (mode === "chain") {
      const path = session.chain.map((point) => ({ x: point.x, y: point.y }));
      session.chain = [];
      if (path.length >= 3) actions.chain(path);
    }
    reset();
  }

  return { down, move, up, reset };
}
