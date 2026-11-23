// Student Dashboard Logic

document.addEventListener("DOMContentLoaded", () => {
  if (!Auth.protectPage("student")) return;

  loadStudentDashboard();
});

async function loadStudentDashboard() {
  await Promise.all([loadAvailableQuizzes(), loadAttemptHistory()]);
}

async function loadAvailableQuizzes() {
  const container = document.getElementById("available-quizzes-container");
  if (!container) return;

  container.innerHTML = `<div style="text-align:center; padding:30px;"><span class="spinner"></span> Loading available quizzes...</div>`;

  try {
    const res = await fetch(`${API_BASE}/api/quizzes/student`, {
      headers: Auth.getHeaders(),
    });
    const data = await res.json();

    if (!data.success || !data.quizzes.length) {
      container.innerHTML = `
        <div style="background:white; border:1px solid var(--border-color); border-radius:var(--radius-md); padding:32px; text-align:center;">
          <p style="color:var(--text-muted); font-size:15px;">No quizzes are currently published by your instructors.</p>
          <p style="font-size:13px; color:var(--text-light); margin-top:4px;">Check back later or ask your teacher to publish a quiz.</p>
        </div>`;
      return;
    }

    container.innerHTML = data.quizzes
      .map(
        (q) => `
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
          <div>
            <h3 style="font-size:18px; font-weight:700;">${q.title}</h3>
            <p style="font-size:13px; color:var(--text-muted); margin-top:4px;">Instructor: ${q.teacherName}</p>
          </div>
          <span class="badge badge-approved">Active</span>
        </div>

        ${q.description ? `<p style="font-size:14px; color:var(--text-main); margin-bottom:14px;">${q.description}</p>` : ""}

        <div style="display:flex; gap:16px; font-size:13px; color:var(--text-muted); margin-bottom:18px; flex-wrap:wrap;">
          <div>⏱️ <strong>${q.durationMinutes}</strong> Minutes</div>
          <div>📝 <strong>${q.totalQuestions}</strong> Questions</div>
          <div>
            🎯 Distribution: 
            <span class="badge badge-easy">${q.distribution.easy} Easy</span>
            <span class="badge badge-medium">${q.distribution.medium} Med</span>
            <span class="badge badge-hard">${q.distribution.hard} Hard</span>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end;">
          <button class="btn btn-primary" onclick="startQuiz('${q.id}')">
            ${q.latestAttempt?.status === "in_progress" ? "Resume Quiz ➔" : "Start Quiz ➔"}
          </button>
        </div>
      </div>
    `
      )
      .join("");
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger); padding:20px;">Failed to load quizzes: ${err.message}</p>`;
  }
}

async function loadAttemptHistory() {
  const tbody = document.getElementById("attempt-history-tbody");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/api/analytics/student`, {
      headers: Auth.getHeaders(),
    });
    const data = await res.json();

    if (data.success) {
      // Update quick stats
      if (document.getElementById("student-stat-completed")) {
        document.getElementById("student-stat-completed").textContent = data.stats.completedAttempts;
      }
      if (document.getElementById("student-stat-avg")) {
        document.getElementById("student-stat-avg").textContent = `${data.stats.averageScore}%`;
      }
      if (document.getElementById("student-stat-highest")) {
        document.getElementById("student-stat-highest").textContent = `${data.stats.highestScore}%`;
      }

      if (!data.history.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:24px;">No quizzes attempted yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.history
        .map(
          (h) => `
        <tr>
          <td style="font-weight:600;">${h.quizTitle}</td>
          <td>
            ${
              h.status === "completed"
                ? `<span class="badge ${h.percentage >= 50 ? "badge-approved" : "badge-rejected"}">${h.score}/${h.total} (${h.percentage}%)</span>`
                : `<span class="badge badge-pending">In Progress</span>`
            }
          </td>
          <td>${formatDate(h.completedAt || h.startedAt)}</td>
          <td><span class="badge ${h.status === "completed" ? "badge-approved" : "badge-pending"}">${h.status}</span></td>
          <td>
            ${
              h.status === "completed"
                ? `<a href="results.html?attemptId=${h.attemptId}" class="btn btn-secondary btn-sm">View Review & Explanations</a>`
                : `<button class="btn btn-primary btn-sm" onclick="startQuiz('${h.quizId}')">Resume</button>`
            }
          </td>
        </tr>
      `
        )
        .join("");
    }
  } catch (err) {
    console.error("Student stats error:", err);
  }
}

function startQuiz(quizId) {
  window.location.href = `quiz.html?quizId=${quizId}`;
}
