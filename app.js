import { Chessground } from "./vendor/chessground/package/dist/chessground.min.js";
import { positions } from "./positions.js";

const ROUND_SECONDS = 60;
const BONUS_SECONDS = 5;
const NEXT_DELAY_MS = 900;
const FAIL_MODAL_DELAY_MS = 620;
const successMessages = [
  "¡Correcto! +5s 🚀",
  "¡Bien hecho! +5 segundos",
  "¡Sigue así! +5s ✨"
];

const boardEl = document.querySelector("#board");
const boardWrapEl = document.querySelector(".board-wrap");
const answerPanelEl = document.querySelector(".answer-panel");
const effectLayerEl = document.querySelector("#effectLayer");
const progressEl = document.querySelector("#progress");
const progressFillEl = document.querySelector("#progressFill");
const streakBadgeEl = document.querySelector("#streakBadge");
const scoreEl = document.querySelector("#score");
const timerEl = document.querySelector("#timer");
const feedbackEl = document.querySelector("#feedback");
const explanationEl = document.querySelector("#explanation");
const questionBlockEl = document.querySelector("#questionBlock");
const finalPanelEl = document.querySelector("#finalPanel");
const finalTitleEl = document.querySelector("#finalTitle");
const finalScoreEl = document.querySelector("#finalScore");
const finalDetailEl = document.querySelector("#finalDetail");
const finalMedalEl = document.querySelector("#finalMedal");
const retryButton = document.querySelector("#retryButton");
const answerButtons = [...document.querySelectorAll("[data-answer]")];

const levels = positions.map((position, index) => ({
  ...position,
  id: index + 1
}));

const state = {
  index: 0,
  score: 0,
  streak: 0,
  secondsLeft: ROUND_SECONDS,
  locked: false,
  ground: null,
  nextTimer: null,
  clockTimer: null,
  audioContext: null,
  started: false,
  finished: false
};

function boardFen(fen) {
  return fen.trim().split(/\s+/)[0];
}

function readonlyBoardConfig(fen) {
  return {
    fen: boardFen(fen),
    orientation: "white",
    coordinates: true,
    viewOnly: true,
    disableContextMenu: true,
    highlight: {
      lastMove: false,
      check: false
    },
    animation: {
      enabled: true,
      duration: 180
    },
    movable: {
      free: false,
      color: undefined,
      dests: new Map()
    },
    draggable: {
      enabled: false
    },
    selectable: {
      enabled: false
    },
    premovable: {
      enabled: false
    },
    predroppable: {
      enabled: false
    },
    drawable: {
      enabled: false,
      visible: false
    }
  };
}

function currentPosition() {
  return levels[state.index];
}

function setButtonsDisabled(disabled) {
  answerButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function updateProgressVisual(reachedLevel = state.index + 1) {
  const safeReached = Math.min(Math.max(reachedLevel, 0), levels.length);
  const percent = levels.length ? (safeReached / levels.length) * 100 : 0;
  progressFillEl.style.width = `${percent}%`;
}

function updateStreakBadge(pop = false) {
  if (state.streak < 3) {
    streakBadgeEl.hidden = true;
    streakBadgeEl.classList.remove("is-hot", "is-legend", "streak-pop");
    return;
  }

  streakBadgeEl.hidden = false;
  streakBadgeEl.textContent = state.streak >= 10
    ? `RACHA x${state.streak} ★`
    : `RACHA x${state.streak} 🔥`;
  streakBadgeEl.classList.toggle("is-hot", state.streak >= 5);
  streakBadgeEl.classList.toggle("is-legend", state.streak >= 10);

  if (pop) {
    streakBadgeEl.classList.remove("streak-pop");
    void streakBadgeEl.offsetWidth;
    streakBadgeEl.classList.add("streak-pop");
  }
}

function medalForTime(secondsLeft) {
  if (secondsLeft >= 60) {
    return { key: "gold", icon: "🥇", label: "Medalla de oro" };
  }

  if (secondsLeft >= 30) {
    return { key: "silver", icon: "🥈", label: "Medalla de plata" };
  }

  return { key: "bronze", icon: "🥉", label: "Medalla de bronce" };
}

function clearEffects() {
  effectLayerEl.replaceChildren();
  boardWrapEl.classList.remove("celebrating", "soft-error", "final-celebration");
  answerPanelEl.classList.remove("panel-pop", "panel-error");
  timerEl.classList.remove("time-bonus");
}

function emitBurst(type = "success") {
  const count = type === "final" ? 58 : type === "success" ? 28 : 18;
  const marks = type === "final"
    ? ["\u2726", "\u2605", "\u2739", "\u2728", "\uD83C\uDFC6", "\uD83D\uDE80"]
    : type === "success"
      ? ["\u2726", "\u2605", "\u2739", "\u2728", "+5", "\uD83D\uDE80"]
      : ["!", "\u26A0", "\u25CF"];

  for (let index = 0; index < count; index += 1) {
    const spark = document.createElement("span");
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.35;
    const distance = type === "final" ? 160 + Math.random() * 300 : 110 + Math.random() * 220;
    spark.className = `spark spark--${type}`;
    spark.textContent = marks[index % marks.length];
    spark.style.left = `${42 + Math.random() * 16}%`;
    spark.style.top = `${42 + Math.random() * 16}%`;
    spark.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
    spark.style.setProperty("--r", `${-30 + Math.random() * 60}deg`);
    spark.style.animationDelay = `${Math.random() * 70}ms`;
    effectLayerEl.appendChild(spark);
  }

  window.setTimeout(() => {
    effectLayerEl.replaceChildren();
  }, type === "final" ? 1450 : 980);
}

function triggerSuccessEffect() {
  clearEffects();
  boardWrapEl.classList.add("celebrating");
  answerPanelEl.classList.add("panel-pop");
  timerEl.classList.add("time-bonus");
  emitBurst("success");

  window.setTimeout(() => {
    boardWrapEl.classList.remove("celebrating");
    answerPanelEl.classList.remove("panel-pop");
  }, 760);
}

function triggerFailEffect() {
  clearEffects();
  boardWrapEl.classList.add("soft-error");
  answerPanelEl.classList.add("panel-error");
  emitBurst("fail");
}

function triggerFinalEffect() {
  clearEffects();
  boardWrapEl.classList.add("final-celebration");
  answerPanelEl.classList.add("panel-pop");
  emitBurst("final");

  window.setTimeout(() => {
    boardWrapEl.classList.remove("final-celebration");
    answerPanelEl.classList.remove("panel-pop");
  }, 1400);
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!state.audioContext) {
    state.audioContext = new AudioContextClass();
  }

  if (state.audioContext.state === "suspended") {
    state.audioContext.resume();
  }

  return state.audioContext;
}

function tone(frequency, start, duration, type = "sine", volume = 0.07) {
  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  const startAt = now + start;
  const endAt = startAt + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.02);
}

function playSuccessSound() {
  tone(523.25, 0, 0.11, "triangle", 0.075);
  tone(659.25, 0.09, 0.13, "triangle", 0.075);
  tone(783.99, 0.2, 0.17, "sine", 0.06);
}

function playFailSound() {
  tone(220, 0, 0.12, "triangle", 0.055);
  tone(164.81, 0.1, 0.18, "sine", 0.05);
}

function playFinalSound() {
  tone(523.25, 0, 0.1, "triangle", 0.075);
  tone(659.25, 0.09, 0.12, "triangle", 0.075);
  tone(783.99, 0.2, 0.14, "triangle", 0.07);
  tone(1046.5, 0.34, 0.28, "sine", 0.06);
}

function renderPosition() {
  const position = currentPosition();
  progressEl.textContent = `${state.index + 1} / ${levels.length}`;
  updateProgressVisual(state.index + 1);
  updateStreakBadge();
  scoreEl.textContent = `${state.score}`;
  timerEl.textContent = `${state.secondsLeft}`;
  feedbackEl.textContent = "";
  feedbackEl.className = "feedback";
  explanationEl.textContent = "";
  clearEffects();
  setButtonsDisabled(false);
  state.locked = false;

  if (!state.ground) {
    state.ground = Chessground(boardEl, readonlyBoardConfig(position.fen));
    startClock();
    return;
  }

  state.ground.set(readonlyBoardConfig(position.fen));
  startClock();
}

function tickClock() {
  if (state.finished) return;

  state.secondsLeft -= 1;
  timerEl.textContent = `${Math.max(0, state.secondsLeft)}`;

  if (state.secondsLeft <= 0) {
    finishGame("timeout");
  }
}

function startClock() {
  if (state.started) return;
  state.started = true;
  window.clearInterval(state.clockTimer);
  state.clockTimer = window.setInterval(tickClock, 1000);
}

function finishGame(reason = "complete", reachedLevel = Math.min(state.index + 1, levels.length)) {
  state.finished = true;
  state.locked = true;
  window.clearTimeout(state.nextTimer);
  window.clearInterval(state.clockTimer);
  setButtonsDisabled(true);
  questionBlockEl.hidden = true;
  finalPanelEl.hidden = false;
  finalPanelEl.className = `final-panel final-panel--${reason}`;
  if (reason !== "complete") {
    state.streak = 0;
  }
  progressEl.textContent = `${reachedLevel} / ${levels.length}`;
  updateProgressVisual(reachedLevel);
  updateStreakBadge();
  scoreEl.textContent = `${state.score}`;
  timerEl.textContent = `${Math.max(0, state.secondsLeft)}`;
  finalMedalEl.textContent = "";
  finalMedalEl.className = "final-medal";
  finalTitleEl.textContent = reason === "complete" ? "Juego terminado" : "Intento terminado";
  finalScoreEl.textContent = `${reachedLevel} / ${levels.length}`;
  finalDetailEl.textContent = `Has llegado hasta el ejercicio ${reachedLevel} de ${levels.length}`;

  if (reason === "fail") {
    finalTitleEl.textContent = "Ups, intento terminado";
    finalScoreEl.textContent = `${reachedLevel}/${levels.length}`;
    finalDetailEl.textContent = "";
  }

  if (reason === "timeout") {
    finalTitleEl.textContent = "Tiempo terminado";
  }

  if (reason === "complete") {
    const medal = medalForTime(Math.max(0, state.secondsLeft));
    finalTitleEl.textContent = "Reto completado";
    finalScoreEl.textContent = `${levels.length}/${levels.length}`;
    finalDetailEl.textContent = "";
    finalMedalEl.textContent = medal.icon;
    finalMedalEl.classList.add(`final-medal--${medal.key}`);
    triggerFinalEffect();
    playFinalSound();
  }
}

function goNext() {
  state.index += 1;
  if (state.index >= levels.length) {
    finishGame();
    return;
  }

  renderPosition();
}

function answer(choice) {
  if (state.locked || state.finished) return;

  startClock();
  const position = currentPosition();
  const isCorrect = choice === position.solution;
  const reachedLevel = state.index + 1;
  state.locked = true;
  setButtonsDisabled(true);

  if (isCorrect) {
    state.score += 1;
    state.streak += 1;
    state.secondsLeft += BONUS_SECONDS;
    timerEl.textContent = `${state.secondsLeft}`;
    feedbackEl.textContent = successMessages[(state.score - 1) % successMessages.length];
    feedbackEl.className = "feedback feedback--correct";
    updateStreakBadge([3, 5, 10].includes(state.streak));
    triggerSuccessEffect();
    playSuccessSound();
  } else {
    state.streak = 0;
    updateStreakBadge();
    feedbackEl.textContent = "Ups, intento terminado";
    feedbackEl.className = "feedback feedback--wrong";
    window.clearInterval(state.clockTimer);
    triggerFailEffect();
    playFailSound();
  }

  explanationEl.textContent = "";
  scoreEl.textContent = `${state.score}`;
  window.clearTimeout(state.nextTimer);
  state.nextTimer = window.setTimeout(
    isCorrect ? goNext : () => finishGame("fail", reachedLevel),
    isCorrect ? NEXT_DELAY_MS : FAIL_MODAL_DELAY_MS
  );
}

function restart() {
  window.clearTimeout(state.nextTimer);
  window.clearInterval(state.clockTimer);
  state.index = 0;
  state.score = 0;
  state.streak = 0;
  state.secondsLeft = ROUND_SECONDS;
  state.locked = false;
  state.started = false;
  state.finished = false;
  questionBlockEl.hidden = false;
  finalPanelEl.hidden = true;
  finalPanelEl.className = "final-panel";
  finalMedalEl.textContent = "";
  finalMedalEl.className = "final-medal";
  finalDetailEl.textContent = "";
  updateProgressVisual(1);
  updateStreakBadge();
  clearEffects();
  renderPosition();
}

answerButtons.forEach((button) => {
  button.addEventListener("click", () => answer(button.dataset.answer));
});

retryButton.addEventListener("click", restart);

renderPosition();
