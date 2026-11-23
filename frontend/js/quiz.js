// Student Quiz Taking Engine

let attemptId = null;
let quizMeta = null;
let questions = [];
let currentIndex = 0;
let userAnswers = {}; // { [questionId]: selectedOptionString }
let timerInterval = null;
let remainingSeconds = 0;

document.addEventListener("DOMContentLoaded", () => {
  if (!Auth.protectPage("student")) return;

  const urlParams = new URLSearchParams(window.location.search);
  const quizId = urlParams.get("quizId");

  if (!quizId) {
    showToast("Invalid quiz reference.", "error");
    setTimeout(() => (window.location.href = "student-dashboard.html"), 1500);
    return;
  }

  initQuizSession(quizId);
  setupQuizControls();
});

async function initQuizSession(quizId) {
  const container = document.getElementById("quiz-app-mount");
  container.innerHTML = `<div style="text-align:center; padding: 60px;"><span class="spinner"></span> Preparing your randomized quiz...</div>`;

  try {
    const res = await fetch(`${API_BASE}/api/quizzes/start`, {
      method: "POST",
      headers: { ...Auth.getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ quizId }),
    });
    const data = await res.json();

    if (!data.success) {
      container.innerHTML = `
        <div style="background:white; border:1px solid var(--border-color); border-radius:var(--radius-md); padding:32px; text-align:center; max-width:500px; margin:40px auto;">
          <h3 style="color:var(--danger); margin-bottom:12px;">Quiz Unavailable</h3>
          <p style="color:var(--text-muted);">${data.message || "Could not start quiz session."}</p>
          <a href="student-dashboard.html" class="btn btn-primary" style="margin-top:20px;">Return to Dashboard</a>
        </div>
      `;
      return;
    }

    attemptId = data.attemptId;
    quizMeta = data.quiz;
    questions = data.questions;
    remainingSeconds = data.quiz.remainingSeconds;

    // Load any saved temporary answers from localStorage if resumed
    const savedKey = `quiz_answers_${attemptId}`;
    try {
      const stored = localStorage.getItem(savedKey);
      if (stored) userAnswers = JSON.parse(stored);
    } catch (e) {}

    renderQuizUI();
    startTimer();

    if (data.isResumed) {
      showToast("Resumed your active attempt. Your randomized question set has been preserved.", "info");
    }
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger); text-align:center; padding:40px;">Connection error: ${err.message}</p>`;
  }
}

function renderQuizUI() {
  const container = document.getElementById("quiz-app-mount");

  container.innerHTML = `
    <div class="quiz-runner-container">
      <!-- Header with Title & Timer -->
      <div class="quiz-header-bar">
        <div>
          <h2 style="font-size:18px; font-weight:700;">${quizMeta.title}</h2>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
            Question <span id="current-q-index-display">1</span> of ${questions.length}
          </div>
        </div>
        <div class="timer-badge" id="timer-display">
          ⏱️ <span id="timer-text">--:--</span>
        </div>
      </div>

      <!-- Question Navigation Palette -->
      <div class="question-nav-palette" id="nav-palette">
        ${questions
          .map(
            (q, idx) => `
          <button class="nav-dot ${userAnswers[q.id] ? "answered" : ""} ${idx === 0 ? "current" : ""}" 
                  id="dot-${idx}" 
                  onclick="jumpToQuestion(${idx})">
            ${idx + 1}
          </button>
        `
          )
          .join("")}
      </div>

      <!-- Question Box -->
      <div class="quiz-question-box">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <span class="badge ${getDifficultyBadgeClass(questions[currentIndex].difficulty)}">
            ${questions[currentIndex].difficulty}
          </span>
        </div>

        <div class="quiz-question-prompt" id="question-prompt-text">
          ${questions[currentIndex].question_text}
        </div>

        <div class="quiz-options-list" id="options-mount">
          ${renderOptionsHtml(questions[currentIndex])}
        </div>
      </div>

      <!-- Navigation Footer -->
      <div class="quiz-footer-nav">
        <button class="btn btn-secondary" id="prev-btn" onclick="prevQuestion()" disabled>
          ◀ Previous
        </button>

        <div style="display:flex; gap:10px;">
          <button class="btn btn-success" onclick="openSubmitModal()">
            Submit Quiz
          </button>
          <button class="btn btn-primary" id="next-btn" onclick="nextQuestion()">
            Next ▶
          </button>
        </div>
      </div>
    </div>
  `;

  updateTimerDisplay();
  updateNavState();
}

function renderOptionsHtml(q) {
  const selectedChoice = userAnswers[q.id];

  return q.options
    .map((opt, idx) => {
      const isSelected = selectedChoice === opt;
      const letter = String.fromCharCode(65 + idx);

      return `
      <div class="quiz-option-choice ${isSelected ? "selected" : ""}" 
           onclick="selectOption('${q.id}', '${escapeQuotes(opt)}')">
        <div class="choice-letter">${letter}</div>
        <div style="flex:1;">${opt}</div>
      </div>
    `;
    })
    .join("");
}

function selectOption(qId, optionText) {
  userAnswers[qId] = optionText;

  // Persist locally in case of disconnect/reload
  try {
    localStorage.setItem(`quiz_answers_${attemptId}`, JSON.stringify(userAnswers));
  } catch (e) {}

  // Update option styles
  const optionsMount = document.getElementById("options-mount");
  if (optionsMount) {
    optionsMount.innerHTML = renderOptionsHtml(questions[currentIndex]);
  }

  // Update palette dot
  const dot = document.getElementById(`dot-${currentIndex}`);
  if (dot) dot.classList.add("answered");
}

function jumpToQuestion(index) {
  if (index < 0 || index >= questions.length) return;
  currentIndex = index;

  // Update question prompt and options
  const q = questions[currentIndex];
  document.getElementById("current-q-index-display").textContent = currentIndex + 1;
  document.getElementById("question-prompt-text").textContent = q.question_text;
  document.getElementById("options-mount").innerHTML = renderOptionsHtml(q);

  updateNavState();
}

function prevQuestion() {
  if (currentIndex > 0) jumpToQuestion(currentIndex - 1);
}

function nextQuestion() {
  if (currentIndex < questions.length - 1) jumpToQuestion(currentIndex + 1);
}

function updateNavState() {
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");

  if (prevBtn) prevBtn.disabled = currentIndex === 0;
  if (nextBtn) nextBtn.disabled = currentIndex === questions.length - 1;

  // Highlight active dot
  document.querySelectorAll(".nav-dot").forEach((d, idx) => {
    d.classList.toggle("current", idx === currentIndex);
  });
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    remainingSeconds -= 1;
    updateTimerDisplay();

    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      showToast("Time has expired! Submitting your quiz automatically...", "warning");
      submitQuizFinal();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const textEl = document.getElementById("timer-text");
  const badgeEl = document.getElementById("timer-display");
  if (!textEl) return;

  const mins = Math.floor(Math.max(0, remainingSeconds) / 60);
  const secs = Math.max(0, remainingSeconds) % 60;
  textEl.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  if (remainingSeconds < 120 && badgeEl) {
    badgeEl.classList.add("warning");
  }
}

// Confirmation Modal & Submission
function setupQuizControls() {
  // Global submit modal listeners can be hooked here
}

function openSubmitModal() {
  const answeredCount = Object.keys(userAnswers).length;
  const unansweredCount = questions.length - answeredCount;

  document.getElementById("modal-answered-count").textContent = answeredCount;
  document.getElementById("modal-unanswered-count").textContent = unansweredCount;

  openModal("submit-confirm-modal");
}

async function submitQuizFinal() {
  closeModal("submit-confirm-modal");
  clearInterval(timerInterval);

  const container = document.getElementById("quiz-app-mount");
  container.innerHTML = `
    <div style="text-align:center; padding: 80px;">
      <span class="spinner" style="width:40px; height:40px;"></span>
      <h3 style="margin-top:16px;">Evaluating your answers...</h3>
      <p style="color:var(--text-muted); font-size:14px; margin-top:6px;">Comparing responses against verified question key.</p>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/api/quizzes/submit`, {
      method: "POST",
      headers: { ...Auth.getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId,
        answers: userAnswers,
      }),
    });
    const data = await res.json();

    if (data.success) {
      // Clear local storage cache
      try {
        localStorage.removeItem(`quiz_answers_${attemptId}`);
      } catch (e) {}

      // Redirect to Results Page
      window.location.href = `results.html?attemptId=${attemptId}`;
    } else {
      showToast(data.message || "Submission failed.", "error");
    }
  } catch (err) {
    showToast("Submission error: " + err.message, "error");
  }
}

// Utilities
function getDifficultyBadgeClass(diff) {
  if (diff === "Easy") return "badge-easy";
  if (diff === "Medium") return "badge-medium";
  return "badge-hard";
}

function escapeQuotes(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}
