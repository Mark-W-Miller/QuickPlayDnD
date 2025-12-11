export const createAnimationLoop = ({
  state,
  logClass,
  sceneBuilder,
  render3d,
  updateEffects3d,
  three,
  memHudGetter
}) => {
  let lastAnimTime = null;

  const stepActiveMoves = (dt) => {
    let changed = false;
    if (state.activeMoves.length) {
      logClass?.("MOVE", `Stepping ${state.activeMoves.length} active moves dt=${dt.toFixed(4)}`);
    }
    state.activeMoves = state.activeMoves.filter((move) => {
      const token = state.tokens.find((t) => t.id.startsWith(move.tokenId));
      if (!token) return false;
      const path = move.path || [];
      if (path.length < 2 || move.index >= path.length - 1) return false;
      const from = path[move.index];
      const to = path[move.index + 1];
      const dx = to.col - token.col;
      const dz = to.row - token.row;
      const dist = Math.hypot(dx, dz);
      const speed = Math.max(0.01, token.speed || move.speed || 12);
      if (dist < 1e-4) {
        token.col = to.col;
        token.row = to.row;
        move.index += 1;
        changed = true;
        return move.index < path.length - 1;
      }
      const step = speed * dt * (state.moveSpeedScale || 1);
      const ratio = Math.min(1, step / dist);
      token.col += dx * ratio;
      token.row += dz * ratio;
      changed = true;
      if (ratio >= 1) {
        token.col = to.col;
        token.row = to.row;
        move.index += 1;
        return move.index < path.length - 1;
      }
      return true;
    });
    if (changed && typeof state.renderTokensWindow === "function") {
      state.renderTokensWindow();
    }
    return changed;
  };

  const tick = (ts) => {
    if (lastAnimTime == null) lastAnimTime = ts;
    const dt = (ts - lastAnimTime) / 1000;
    lastAnimTime = ts;

    const memHud = memHudGetter?.();
    if (memHud && ts - (memHud._lastUpdate || 0) > 500) {
      memHud._lastUpdate = ts;
      const perfMem = performance.memory || {};
      const used = perfMem.usedJSHeapSize ? (perfMem.usedJSHeapSize / 1048576).toFixed(1) : "n/a";
      const total = perfMem.totalJSHeapSize ? (perfMem.totalJSHeapSize / 1048576).toFixed(1) : "n/a";
      const tex = three.renderer?.info?.memory?.textures ?? "n/a";
      const geom = three.renderer?.info?.memory?.geometries ?? "n/a";
      memHud.textContent = `heap ${used}/${total} MB | tex ${tex} | geo ${geom}`;
    }

    const moved = stepActiveMoves(dt);
    if (state.lastBoard) {
      const { boardWidth, boardDepth, surfaceY, cellUnit } = state.lastBoard;
      if (moved) {
        sceneBuilder.updateTokens3d(boardWidth, boardDepth, surfaceY, cellUnit);
        render3d();
      }
      state.activeEffects = state.activeEffects.filter((fx) => {
        fx.age += dt * (state.moveSpeedScale || 1);
        return fx.age <= (fx.duration || 600);
      });
      updateEffects3d(boardWidth, boardDepth, surfaceY, cellUnit);
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
  return { stepActiveMoves };
};
