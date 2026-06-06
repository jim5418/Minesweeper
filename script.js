const LEVELS = {
  beginner: { label: "Beginner", rows: 9, cols: 9, mines: 10 },
  intermediate: { label: "Intermediate", rows: 16, cols: 16, mines: 40 },
  expert: { label: "Expert", rows: 16, cols: 30, mines: 99 },
};

const boardEl = document.querySelector("#board");
const difficultyEl = document.querySelector("#difficulty");
const bestScoreEl = document.querySelector("#bestScore");
const skinEl = document.querySelector("#skin");
const newGameEl = document.querySelector("#newGame");
const flagModeEl = document.querySelector("#flagMode");
const minesLeftEl = document.querySelector("#minesLeft");
const timerEl = document.querySelector("#timer");
const messageEl = document.querySelector("#message");
const announcerEl = document.querySelector("#announcer");
const controlsModalEl = document.querySelector("#controlsModal");
const closeControlsEl = document.querySelector("#closeControls");
const hideControlsEl = document.querySelector("#hideControls");

const SKINS = new Set(["classic", "field", "night"]);
const STORAGE_KEYS = {
  skin: "minesweeper.skin",
  hideControls: "minesweeper.hideControls",
  bestPrefix: "minesweeper.best.",
};

let state;
let explosionTimers = [];

function createState(levelKey) {
  const level = LEVELS[levelKey];
  return {
    levelKey,
    level,
    cells: Array.from({ length: level.rows * level.cols }, (_, index) => ({
      index,
      row: Math.floor(index / level.cols),
      col: index % level.cols,
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    })),
    generated: false,
    gameOver: false,
    won: false,
    revealedCount: 0,
    flags: 0,
    flagMode: false,
    selectedIndex: 0,
    startedAt: 0,
    elapsed: 0,
    elapsedMs: 0,
    timerId: 0,
  };
}

function startGame(levelKey = difficultyEl.value) {
  clearExplosionTimers();
  stopTimer();
  state = createState(levelKey);
  document.body.classList.remove("playing", "won", "lost");
  flagModeEl.setAttribute("aria-pressed", "false");
  boardEl.style.setProperty("--cols", state.level.cols);
  renderBoard();
  fitBoard();
  selectCell(0);
  updateBestScore();
  updateStatus("Ready");
  setFace("☺");
  announcerEl.textContent = `${state.level.label}, ${state.level.rows} by ${state.level.cols}, ${state.level.mines} mines`;
  maybeShowControls();
}

function renderBoard() {
  boardEl.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (const cell of state.cells) {
    const button = document.createElement("button");
    button.className = "cell";
    button.type = "button";
    button.tabIndex = -1;
    button.dataset.index = cell.index;
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", cellLabel(cell));
    button.addEventListener("click", onCellClick);
    button.addEventListener("contextmenu", onCellRightClick);
    button.addEventListener("dblclick", onCellDoubleClick);
    button.addEventListener("pointerdown", onCellPointerDown);
    button.addEventListener("pointerup", onCellPointerUp);
    button.addEventListener("pointerleave", onCellPointerUp);
    fragment.append(button);
  }

  boardEl.append(fragment);
}

function generateMines(firstIndex) {
  const forbidden = new Set([firstIndex, ...neighbors(firstIndex).map((cell) => cell.index)]);
  const candidates = state.cells
    .filter((cell) => !forbidden.has(cell.index))
    .map((cell) => cell.index);

  shuffle(candidates);

  for (const index of candidates.slice(0, state.level.mines)) {
    state.cells[index].mine = true;
  }

  for (const cell of state.cells) {
    cell.adjacent = neighbors(cell.index).filter((nearby) => nearby.mine).length;
  }

  state.generated = true;
}

function onCellClick(event) {
  const index = Number(event.currentTarget.dataset.index);
  selectCell(index);
  event.currentTarget.classList.remove("armed");

  if (state.flagMode) {
    toggleFlag(index);
    return;
  }

  reveal(index);
}

function onCellRightClick(event) {
  event.preventDefault();
  const index = Number(event.currentTarget.dataset.index);
  selectCell(index);
  toggleFlag(index);
}

function onCellDoubleClick(event) {
  const index = Number(event.currentTarget.dataset.index);
  selectCell(index);
  chord(index);
}

function onCellPointerDown(event) {
  const index = Number(event.currentTarget.dataset.index);
  selectCell(index);
  if (state.gameOver || state.cells[index].revealed || state.cells[index].flagged) return;
  event.currentTarget.classList.add("armed");
  setFace("☻");
}

function onCellPointerUp(event) {
  event.currentTarget.classList.remove("armed");
  if (!state.gameOver) setFace("☺");
}

function reveal(index) {
  const cell = state.cells[index];
  if (state.gameOver || cell.revealed || cell.flagged) return;

  if (!state.generated) {
    generateMines(index);
    startTimer();
    document.body.classList.add("playing");
  }

  if (cell.mine) {
    cell.revealed = true;
    lose(index);
    return;
  }

  floodReveal(index);
  updateCells();
  checkWin();
}

function floodReveal(index) {
  const stack = [state.cells[index]];
  const seen = new Set();

  while (stack.length > 0) {
    const cell = stack.pop();
    if (!cell || seen.has(cell.index) || cell.revealed || cell.flagged) continue;

    seen.add(cell.index);
    cell.revealed = true;
    state.revealedCount += 1;

    if (cell.adjacent === 0) {
      for (const nearby of neighbors(cell.index)) {
        if (!nearby.revealed && !nearby.flagged) stack.push(nearby);
      }
    }
  }
}

function toggleFlag(index) {
  const cell = state.cells[index];
  if (state.gameOver || cell.revealed) return;

  cell.flagged = !cell.flagged;
  state.flags += cell.flagged ? 1 : -1;
  updateCell(cell);
  updateStatus(state.generated ? "Playing" : "Ready");
}

function chord(index) {
  const cell = state.cells[index];
  if (state.gameOver || !cell.revealed || cell.adjacent === 0) return;

  const nearby = neighbors(index);
  const flagged = nearby.filter((item) => item.flagged).length;
  if (flagged !== cell.adjacent) return;

  for (const item of nearby) {
    if (!item.flagged && !item.revealed) reveal(item.index);
  }
}

function lose(explodedIndex) {
  state.gameOver = true;
  stopTimer();
  clearExplosionTimers();
  document.body.classList.remove("playing", "won");
  document.body.classList.add("lost");
  setFace("☹");

  const explodedCell = state.cells[explodedIndex];
  if (explodedCell) explodedCell.revealed = true;

  updateCells(explodedIndex);
  updateStatus("Lost");
  announcerEl.textContent = "Mine hit. Game over.";

  const remainingMines = state.cells.filter((cell) => cell.mine && cell.index !== explodedIndex);
  shuffle(remainingMines);

  remainingMines.forEach((cell, order) => {
    const timerId = window.setTimeout(() => {
      if (!state.gameOver || state.won) return;
      cell.revealed = true;
      updateCell(cell, cell.index);
    }, 130 + order * 42);
    explosionTimers.push(timerId);
  });
}

function checkWin() {
  const safeCells = state.cells.length - state.level.mines;
  if (state.revealedCount !== safeCells) {
    updateStatus("Playing");
    return;
  }

  state.gameOver = true;
  state.won = true;
  stopTimer();
  document.body.classList.remove("playing", "lost");
  document.body.classList.add("won");
  setFace("😎");
  const newBest = saveBestIfFaster(state.levelKey, state.elapsedMs);

  for (const cell of state.cells) {
    if (cell.mine && !cell.flagged) {
      cell.flagged = true;
      state.flags += 1;
    }
  }

  updateCells();
  updateBestScore();
  updateStatus(newBest ? "New Best" : "Victory");
  announcerEl.textContent = newBest
    ? `New best time: ${formatSeconds(state.elapsedMs)}.`
    : `Victory in ${formatSeconds(state.elapsedMs)}.`;
}

function updateCells(explodedIndex = -1) {
  for (const cell of state.cells) updateCell(cell, explodedIndex);
}

function updateCell(cell, explodedIndex = -1) {
  const button = boardEl.children[cell.index];
  button.className = "cell";
  if (cell.index === state.selectedIndex) button.classList.add("selected");
  button.textContent = "";
  button.disabled = state.gameOver || cell.revealed;
  button.setAttribute("aria-label", cellLabel(cell));

  if (cell.flagged && !cell.revealed) {
    button.classList.add("flagged");
    return;
  }

  if (!cell.revealed) return;

  button.classList.add("revealed");

  if (cell.mine) {
    button.classList.add("mine");
    if (cell.index === explodedIndex) button.classList.add("exploded");
    return;
  }

  if (cell.adjacent > 0) {
    button.textContent = String(cell.adjacent);
    button.classList.add(`n${cell.adjacent}`);
  }
}

function updateStatus(message) {
  minesLeftEl.textContent = String(Math.max(0, state.level.mines - state.flags)).padStart(3, "0");
  timerEl.textContent = String(Math.min(999, state.elapsed)).padStart(3, "0");
  messageEl.textContent = message;
}

function updateBestScore() {
  const bestMs = readBestMs(state.levelKey);
  bestScoreEl.textContent = bestMs === null ? "Best: --" : `Best: ${formatSeconds(bestMs)}`;
  bestScoreEl.title = `${state.level.label} best time`;
}

function readBestMs(levelKey) {
  const value = readPreference(`${STORAGE_KEYS.bestPrefix}${levelKey}`);
  if (value === null) return null;
  const bestMs = Number(value);
  return Number.isFinite(bestMs) && bestMs > 0 ? bestMs : null;
}

function saveBestIfFaster(levelKey, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return false;
  const currentBest = readBestMs(levelKey);
  if (currentBest !== null && elapsedMs >= currentBest) return false;

  writePreference(`${STORAGE_KEYS.bestPrefix}${levelKey}`, String(elapsedMs));
  return true;
}

function formatSeconds(milliseconds) {
  return `${(milliseconds / 1000).toFixed(3)}s`;
}

function applySkin(skin, persist = true) {
  const nextSkin = SKINS.has(skin) ? skin : "classic";
  document.body.dataset.skin = nextSkin;
  skinEl.value = nextSkin;
  if (persist) writePreference(STORAGE_KEYS.skin, nextSkin);
}

function readPreference(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePreference(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // File URLs can disable localStorage in some browser settings.
  }
}

function maybeShowControls() {
  if (readPreference(STORAGE_KEYS.hideControls) === "true") return;
  controlsModalEl.classList.remove("hidden");
}

function closeControls() {
  controlsModalEl.classList.add("hidden");
}

function hideControlsPermanently() {
  writePreference(STORAGE_KEYS.hideControls, "true");
  closeControls();
}

function selectCell(index) {
  if (!state || index < 0 || index >= state.cells.length) return;
  const previous = boardEl.children[state.selectedIndex];
  if (previous) previous.classList.remove("selected");

  state.selectedIndex = index;
  const current = boardEl.children[index];
  if (!current) return;

  current.classList.add("selected");
  current.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

function moveSelection(rowDelta, colDelta) {
  if (!state) return;
  const cell = state.cells[state.selectedIndex];
  const row = Math.max(0, Math.min(state.level.rows - 1, cell.row + rowDelta));
  const col = Math.max(0, Math.min(state.level.cols - 1, cell.col + colDelta));
  selectCell(row * state.level.cols + col);
}

function handleKeyboard(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (!controlsModalEl.classList.contains("hidden")) {
    if (event.key === "Escape") closeControls();
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "r") {
    event.preventDefault();
    startGame(state.levelKey);
    return;
  }

  if (["w", "a", "s", "d", "enter", "shift"].includes(key)) event.preventDefault();

  if (key === "w") moveSelection(-1, 0);
  if (key === "s") moveSelection(1, 0);
  if (key === "a") moveSelection(0, -1);
  if (key === "d") moveSelection(0, 1);

  if (key === "shift") {
    if (event.repeat) return;
    toggleFlag(state.selectedIndex);
    return;
  }

  if (key === "enter") {
    const cell = state.cells[state.selectedIndex];
    if (cell.revealed) chord(state.selectedIndex);
    else reveal(state.selectedIndex);
  }
}

function setFace(face) {
  newGameEl.textContent = face;
}

function startTimer() {
  if (state.timerId) return;
  state.startedAt = nowMs() - state.elapsedMs;
  state.timerId = window.setInterval(() => {
    state.elapsedMs = nowMs() - state.startedAt;
    state.elapsed = Math.floor(state.elapsedMs / 1000);
    updateStatus("Playing");
  }, 250);
}

function stopTimer() {
  if (!state?.timerId) return;
  state.elapsedMs = nowMs() - state.startedAt;
  state.elapsed = Math.floor(state.elapsedMs / 1000);
  window.clearInterval(state.timerId);
  state.timerId = 0;
}

function nowMs() {
  return window.performance?.now?.() ?? Date.now();
}

function clearExplosionTimers() {
  for (const timerId of explosionTimers) window.clearTimeout(timerId);
  explosionTimers = [];
}

function neighbors(index) {
  const cell = state.cells[index];
  const list = [];

  for (let row = cell.row - 1; row <= cell.row + 1; row += 1) {
    for (let col = cell.col - 1; col <= cell.col + 1; col += 1) {
      if (row === cell.row && col === cell.col) continue;
      if (row < 0 || col < 0 || row >= state.level.rows || col >= state.level.cols) continue;
      list.push(state.cells[row * state.level.cols + col]);
    }
  }

  return list;
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function cellLabel(cell) {
  const position = `row ${cell.row + 1}, column ${cell.col + 1}`;
  if (cell.flagged && !cell.revealed) return `${position}, flagged`;
  if (!cell.revealed) return `${position}, hidden`;
  if (cell.mine) return `${position}, mine`;
  if (cell.adjacent === 0) return `${position}, clear`;
  return `${position}, ${cell.adjacent} nearby mines`;
}

function fitBoard() {
  const width = Math.max(320, document.documentElement.clientWidth);
  const available = Math.min(1120, width - 46);
  const fit = Math.floor(available / state.level.cols);
  const size = Math.max(20, Math.min(28, fit));
  const boardWidth = size * state.level.cols;
  boardEl.style.setProperty("--cell-size", `${size}px`);
  document.documentElement.style.setProperty("--board-width", `${boardWidth}px`);
  document.documentElement.style.setProperty("--panel-width", `${boardWidth + 28}px`);
  document.documentElement.style.setProperty("--window-width", `${boardWidth + 46}px`);
}

difficultyEl.addEventListener("change", () => startGame(difficultyEl.value));
skinEl.addEventListener("change", () => applySkin(skinEl.value));
newGameEl.addEventListener("click", () => startGame(state.levelKey));
flagModeEl.addEventListener("click", () => {
  state.flagMode = !state.flagMode;
  flagModeEl.setAttribute("aria-pressed", String(state.flagMode));
});
closeControlsEl.addEventListener("click", closeControls);
hideControlsEl.addEventListener("click", hideControlsPermanently);
controlsModalEl.addEventListener("click", (event) => {
  if (event.target === controlsModalEl) closeControls();
});
document.addEventListener("keydown", handleKeyboard);
window.addEventListener("resize", fitBoard);

applySkin(readPreference(STORAGE_KEYS.skin), false);
startGame();


