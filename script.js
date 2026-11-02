"use strict";

const difficultyConfig = {
  easy: { label: "Easy", description: "Relaxed pace with extra thinking time", bubbleSpeed: 42, bubbleCount: 5, spawnMs: 1150, magnetTargets: 15, magnetTime: 40 },
  medium: { label: "Medium", description: "Balanced pace and challenge", bubbleSpeed: 62, bubbleCount: 6, spawnMs: 900, magnetTargets: 20, magnetTime: 32 },
  hard: { label: "Hard", description: "Fast targets and tighter time limits", bubbleSpeed: 84, bubbleCount: 8, spawnMs: 680, magnetTargets: 25, magnetTime: 25 }
};

const keySets = {
  home: ["A", "S", "D", "F", "J", "K", "L"],
  alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  numbers: "1234567890".split("")
};

const keyboardRows = [
  "1234567890".split(""),
  "QWERTYUIOP".split(""),
  "ASDFGHJKL".split(""),
  "ZXCVBNM".split("")
];

const elements = {
  homeScreen: document.querySelector("#homeScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  difficultyButtons: [...document.querySelectorAll(".difficulty-btn")],
  difficultySummary: document.querySelector("#difficultySummary"),
  keySetSelect: document.querySelector("#keySetSelect"),
  gameTitle: document.querySelector("#gameTitle"),
  gameDifficulty: document.querySelector("#gameDifficulty"),
  statsGrid: document.querySelector("#statsGrid"),
  feedback: document.querySelector("#feedbackBanner"),
  bubbleGame: document.querySelector("#bubbleGame"),
  bubbleArena: document.querySelector("#bubbleArena"),
  bubbleMessage: document.querySelector("#bubbleMessage"),
  magnetGame: document.querySelector("#magnetGame"),
  targetKey: document.querySelector("#targetKey"),
  keyboard: document.querySelector("#keyboard"),
  roundProgressText: document.querySelector("#roundProgressText"),
  roundProgressBar: document.querySelector("#roundProgressBar"),
  startGame: document.querySelector("#startGame"),
  restartGame: document.querySelector("#restartGame"),
  resetGame: document.querySelector("#resetGame"),
  backHome: document.querySelector("#backHome"),
  brandHome: document.querySelector("#brandHome"),
  resultsModal: document.querySelector("#resultsModal"),
  resultsTitle: document.querySelector("#resultsTitle"),
  resultKicker: document.querySelector("#resultKicker"),
  resultCopy: document.querySelector("#resultCopy"),
  resultScore: document.querySelector("#resultScore"),
  resultStats: document.querySelector("#resultStats"),
  playAgain: document.querySelector("#playAgain"),
  chooseMode: document.querySelector("#chooseMode")
};

let selectedDifficulty = "medium";
let currentMode = null;
let running = false;
let score = 0;
let timerId = null;
let spawnId = null;
let animationId = null;
let feedbackId = null;
let resultsModal = null;
let bubbles = [];
let misses = 0;
let popped = 0;
let level = 1;
let lastFrame = 0;
let magnet = createMagnetState();

function createMagnetState() {
  return {
    target: "",
    correct: 0,
    incorrect: 0,
    elapsed: 0,
    remaining: 0,
    locked: false,
    targetStartedAt: 0,
    responseTimes: []
  };
}

function initialize() {
  renderKeyboard();
  bindEvents();
  setDifficulty("medium");
  resultsModal = bootstrap.Modal.getOrCreateInstance(elements.resultsModal, { backdrop: "static" });
}

function bindEvents() {
  elements.difficultyButtons.forEach(button => button.addEventListener("click", () => setDifficulty(button.dataset.difficulty)));
  document.querySelectorAll("[data-start-mode]").forEach(button => button.addEventListener("click", () => openMode(button.dataset.startMode)));
  elements.startGame.addEventListener("click", startCurrentGame);
  elements.restartGame.addEventListener("click", restartCurrentGame);
  elements.resetGame.addEventListener("click", goHome);
  elements.backHome.addEventListener("click", goHome);
  elements.brandHome.addEventListener("click", goHome);
  elements.playAgain.addEventListener("click", () => { resultsModal.hide(); restartCurrentGame(); });
  elements.chooseMode.addEventListener("click", () => { resultsModal.hide(); goHome(); });
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", keepBubblesInBounds);
}

function setDifficulty(difficulty) {
  selectedDifficulty = difficulty;
  elements.difficultyButtons.forEach(button => button.classList.toggle("active", button.dataset.difficulty === difficulty));
  elements.difficultySummary.textContent = difficultyConfig[difficulty].description;
}

function openMode(mode) {
  cleanupGame();
  currentMode = mode;
  resetModeState();
  elements.homeScreen.classList.remove("active");
  elements.gameScreen.classList.add("active");
  elements.bubbleGame.classList.toggle("active", mode === "bubbles");
  elements.magnetGame.classList.toggle("active", mode === "magnet");
  elements.gameTitle.textContent = mode === "bubbles" ? "Bubble Burst" : "Key Magnet";
  elements.gameDifficulty.textContent = difficultyConfig[selectedDifficulty].label;
  elements.startGame.disabled = false;
  elements.startGame.innerHTML = '<i class="bi bi-play-fill"></i> Start';
  setFeedback("Press Start when you are ready.", "neutral", "bi-keyboard");
  updateStats();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startCurrentGame() {
  if (running || !currentMode) return;
  running = true;
  elements.startGame.disabled = true;
  elements.startGame.innerHTML = '<i class="bi bi-controller"></i> Playing';
  if (currentMode === "bubbles") startBubbles();
  else startMagnet();
}

function restartCurrentGame() {
  if (!currentMode) return;
  const mode = currentMode;
  cleanupGame();
  currentMode = mode;
  resetModeState();
  updateStats();
  startCurrentGame();
}

function resetModeState() {
  score = 0;
  misses = 0;
  popped = 0;
  level = 1;
  magnet = createMagnetState();
  elements.bubbleMessage.classList.remove("hidden");
  elements.targetKey.textContent = "?";
  elements.roundProgressText.textContent = `0 / ${difficultyConfig[selectedDifficulty].magnetTargets}`;
  elements.roundProgressBar.style.width = "0%";
  resetKeyboardClasses();
}

function goHome() {
  if (resultsModal) resultsModal.hide();
  cleanupGame();
  currentMode = null;
  elements.gameScreen.classList.remove("active");
  elements.homeScreen.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cleanupGame() {
  running = false;
  clearInterval(timerId);
  clearInterval(spawnId);
  clearTimeout(feedbackId);
  cancelAnimationFrame(animationId);
  timerId = null;
  spawnId = null;
  animationId = null;
  feedbackId = null;
  bubbles.forEach(bubble => bubble.element.remove());
  bubbles = [];
  lastFrame = 0;
}

function startBubbles() {
  elements.bubbleMessage.classList.add("hidden");
  setFeedback("Type a visible letter to pop it!", "neutral", "bi-stars");
  const config = difficultyConfig[selectedDifficulty];
  for (let index = 0; index < config.bubbleCount; index += 1) {
    createBubble(true, index);
  }
  spawnId = setInterval(() => {
    const targetCount = config.bubbleCount + Math.min(3, level - 1);
    if (bubbles.length < targetCount) createBubble(false);
  }, config.spawnMs);
  lastFrame = performance.now();
  animationId = requestAnimationFrame(moveBubbles);
  elements.bubbleArena.focus({ preventScroll: true });
}

function createBubble(initial = false, index = 0) {
  if (!running || currentMode !== "bubbles") return;
  const element = document.createElement("div");
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const size = 58 + Math.floor(Math.random() * 25);
  const arenaWidth = elements.bubbleArena.clientWidth;
  const x = Math.max(6, Math.random() * Math.max(10, arenaWidth - size - 12));
  const y = initial ? elements.bubbleArena.clientHeight + index * 45 + Math.random() * 100 : elements.bubbleArena.clientHeight + size;
  element.className = "game-bubble";
  element.textContent = letter;
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.style.left = "0";
  element.style.top = "0";
  element.style.setProperty("--hue", String([188, 207, 258, 322, 158][Math.floor(Math.random() * 5)]));
  element.setAttribute("aria-label", `Letter ${letter}`);
  elements.bubbleArena.appendChild(element);
  bubbles.push({ element, letter, x, y, size, drift: (Math.random() - .5) * 12 });
}

function moveBubbles(timestamp) {
  if (!running || currentMode !== "bubbles") return;
  const delta = Math.min((timestamp - lastFrame) / 1000, .04);
  lastFrame = timestamp;
  const config = difficultyConfig[selectedDifficulty];
  const currentSpeed = config.bubbleSpeed * (1 + (level - 1) * .12);
  const escaped = [];

  bubbles.forEach(bubble => {
    bubble.y -= currentSpeed * delta;
    bubble.x += bubble.drift * delta;
    if (bubble.x < 4 || bubble.x > elements.bubbleArena.clientWidth - bubble.size - 4) bubble.drift *= -1;
    bubble.element.style.transform = `translate3d(${bubble.x}px, ${bubble.y}px, 0)`;
    if (bubble.y + bubble.size < 35) escaped.push(bubble);
  });

  escaped.forEach(registerMiss);
  if (running) animationId = requestAnimationFrame(moveBubbles);
}

function registerMiss(bubble) {
  removeBubble(bubble);
  misses += 1;
  setFeedback(`Missed ${bubble.letter}. ${Math.max(0, 6 - misses)} chances left.`, "incorrect", "bi-exclamation-triangle-fill");
  updateStats();
  if (misses >= 6) endGame("gameover");
}

function handleBubbleKey(key) {
  const match = bubbles.find(bubble => bubble.letter === key);
  if (match) {
    popped += 1;
    score += 10 * level;
    match.element.classList.add("pop");
    bubbles = bubbles.filter(bubble => bubble !== match);
    setTimeout(() => match.element.remove(), 210);
    const nextLevel = Math.min(5, Math.floor(popped / 8) + 1);
    if (nextLevel > level) {
      level = nextLevel;
      setFeedback(`Level ${level}! Bubbles are moving faster.`, "correct", "bi-graph-up-arrow");
    } else {
      setFeedback(`Perfect! +${10 * level} points`, "correct", "bi-check-circle-fill");
    }
    if (bubbles.length < difficultyConfig[selectedDifficulty].bubbleCount) createBubble(false);
  } else {
    score = Math.max(0, score - 2);
    setFeedback("No matching bubble. -2 points", "incorrect", "bi-x-circle-fill");
  }
  updateStats();
}

function removeBubble(bubble) {
  bubble.element.remove();
  bubbles = bubbles.filter(item => item !== bubble);
}

function keepBubblesInBounds() {
  if (currentMode !== "bubbles") return;
  bubbles.forEach(bubble => {
    bubble.x = Math.min(bubble.x, Math.max(4, elements.bubbleArena.clientWidth - bubble.size - 4));
  });
}

function startMagnet() {
  const config = difficultyConfig[selectedDifficulty];
  magnet.remaining = config.magnetTime;
  magnet.elapsed = 0;
  setFeedback("Match the highlighted target key.", "neutral", "bi-bullseye");
  chooseNextTarget();
  timerId = setInterval(() => {
    magnet.remaining -= 1;
    magnet.elapsed += 1;
    updateStats();
    if (magnet.remaining <= 0) endGame("timeout");
  }, 1000);
}

function chooseNextTarget() {
  const set = keySets[elements.keySetSelect.value];
  let next = set[Math.floor(Math.random() * set.length)];
  if (set.length > 1) while (next === magnet.target) next = set[Math.floor(Math.random() * set.length)];
  magnet.target = next;
  magnet.targetStartedAt = performance.now();
  elements.targetKey.textContent = next;
  resetKeyboardClasses();
  const targetElement = elements.keyboard.querySelector(`[data-key="${next}"]`);
  if (targetElement) targetElement.classList.add("target");
  magnet.locked = false;
}

function handleMagnetKey(key) {
  if (magnet.locked) return;
  magnet.locked = true;
  const pressedElement = elements.keyboard.querySelector(`[data-key="${key}"]`);
  const totalTargets = difficultyConfig[selectedDifficulty].magnetTargets;

  if (key === magnet.target) {
    const responseTime = performance.now() - magnet.targetStartedAt;
    magnet.responseTimes.push(responseTime);
    magnet.correct += 1;
    const speedBonus = Math.max(0, Math.round(10 - responseTime / 180));
    score += 10 + speedBonus;
    if (pressedElement) pressedElement.classList.add("correct");
    setFeedback(`Correct! ${formatMilliseconds(responseTime)} response`, "correct", "bi-check-circle-fill");
  } else {
    magnet.incorrect += 1;
    score = Math.max(0, score - 2);
    if (pressedElement) {
      pressedElement.classList.add("incorrect");
      setTimeout(() => pressedElement.classList.remove("incorrect"), 250);
    }
    setFeedback(`Expected ${magnet.target}, not ${key}. -2 points`, "incorrect", "bi-x-circle-fill");
  }

  updateStats();
  if (magnet.correct + magnet.incorrect >= totalTargets) {
    setTimeout(() => endGame("complete"), 220);
  } else {
    setTimeout(() => { if (running) chooseNextTarget(); }, key === magnet.target ? 160 : 250);
  }
}

function handleKeydown(event) {
  if (!running || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
  const key = event.key.toUpperCase();
  if (!/^[A-Z0-9]$/.test(key)) return;
  event.preventDefault();
  if (currentMode === "bubbles" && /^[A-Z]$/.test(key)) handleBubbleKey(key);
  if (currentMode === "magnet") handleMagnetKey(key);
}

function updateStats() {
  if (currentMode === "bubbles") {
    elements.statsGrid.innerHTML = [
      statMarkup("Score", score),
      statMarkup("Misses", `${misses} / 6`),
      statMarkup("Popped", popped),
      statMarkup("Level", level)
    ].join("");
  } else if (currentMode === "magnet") {
    const total = difficultyConfig[selectedDifficulty].magnetTargets;
    const attempts = magnet.correct + magnet.incorrect;
    const accuracy = attempts ? Math.round((magnet.correct / attempts) * 100) : 100;
    elements.statsGrid.innerHTML = [
      statMarkup("Score", score),
      statMarkup("Correct", magnet.correct),
      statMarkup("Incorrect", magnet.incorrect),
      statMarkup("Time left", `${magnet.remaining}s`)
    ].join("");
    elements.roundProgressText.textContent = `${attempts} / ${total} attempts - ${accuracy}% accuracy`;
    elements.roundProgressBar.style.width = `${Math.min(100, (attempts / total) * 100)}%`;
  }
}

function statMarkup(label, value) {
  return `<div class="stat-card"><span>${label}</span><strong>${value}</strong></div>`;
}

function setFeedback(message, type = "neutral", icon = "bi-info-circle") {
  clearTimeout(feedbackId);
  elements.feedback.className = `feedback-banner ${type === "neutral" ? "" : type}`.trim();
  elements.feedback.innerHTML = `<i class="bi ${icon}"></i><span>${message}</span>`;
  if (type !== "neutral") {
    feedbackId = setTimeout(() => {
      elements.feedback.className = "feedback-banner";
    }, 850);
  }
}

function endGame(reason) {
  if (!running) return;
  const completedMode = currentMode;
  const bubbleSummary = { misses, popped, level };
  const magnetSummary = { ...magnet, responseTimes: [...magnet.responseTimes] };
  cleanupGame();
  elements.startGame.disabled = false;
  elements.startGame.innerHTML = '<i class="bi bi-play-fill"></i> Start';

  if (completedMode === "bubbles") {
    elements.resultKicker.textContent = reason === "gameover" ? "Miss limit reached" : "Round complete";
    elements.resultsTitle.textContent = bubbleSummary.popped >= 25 ? "Bubble master!" : "Nice popping!";
    elements.resultCopy.textContent = `You cleared ${bubbleSummary.popped} bubbles and reached level ${bubbleSummary.level}.`;
    elements.resultStats.innerHTML = [
      resultStat("Bubbles", bubbleSummary.popped),
      resultStat("Misses", bubbleSummary.misses),
      resultStat("Level", bubbleSummary.level)
    ].join("");
  } else {
    const totalAttempts = magnetSummary.correct + magnetSummary.incorrect;
    const accuracy = totalAttempts ? Math.round((magnetSummary.correct / totalAttempts) * 100) : 0;
    const average = averageResponse(magnetSummary.responseTimes);
    elements.resultKicker.textContent = reason === "timeout" ? "Time is up" : "Challenge complete";
    elements.resultsTitle.textContent = accuracy >= 90 ? "Precision unlocked!" : "Solid practice!";
    elements.resultCopy.textContent = reason === "timeout" ? "The clock won this round. Your accuracy still counts." : "You completed the full target sequence.";
    elements.resultStats.innerHTML = [
      resultStat("Accuracy", `${accuracy}%`),
      resultStat("Correct", magnetSummary.correct),
      resultStat("Avg. time", average ? formatMilliseconds(average) : "-")
    ].join("");
  }
  elements.resultScore.textContent = score;
  resultsModal.show();
}

function resultStat(label, value) {
  return `<div class="result-stat"><strong>${value}</strong><span>${label}</span></div>`;
}

function averageResponse(times) {
  if (!times.length) return 0;
  return times.reduce((sum, value) => sum + value, 0) / times.length;
}

function formatMilliseconds(milliseconds) {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

function renderKeyboard() {
  elements.keyboard.innerHTML = keyboardRows.map(row => `
    <div class="keyboard-row">
      ${row.map(key => `<div class="visual-key" data-key="${key}">${key}</div>`).join("")}
    </div>
  `).join("");
}

function resetKeyboardClasses() {
  elements.keyboard.querySelectorAll(".visual-key").forEach(key => key.classList.remove("target", "correct", "incorrect"));
}

initialize();



