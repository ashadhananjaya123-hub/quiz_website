// Teacher Dashboard Logic

let currentQuestions = [];
let editingQuestionId = null;
let currentMaterials = [];

// Initialize Teacher Dashboard
document.addEventListener("DOMContentLoaded", () => {
  if (!Auth.protectPage("teacher")) return;

  setupNavigation();
  loadDashboardData();
  setupUploadForm();
  setupQuestionBankFilters();
  setupEditQuestionModal();
  setupQuizCreationForm();
});

// Sidebar Tab Navigation
function setupNavigation() {
  const navItems = document.querySelectorAll(".sidebar-nav .nav-item[data-section]");
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const targetSection = item.getAttribute("data-section");

      navItems.forEach((n) => n.classList.remove("active"));
      item.classList.add("active");

      document.querySelectorAll(".tab-section").forEach((sec) => (sec.style.display = "none"));
      const activeSec = document.getElementById(targetSection);
      if (activeSec) activeSec.style.display = "block";

      // Load section-specific data
      if (targetSection === "dashboard-section") loadDashboardData();
      if (targetSection === "upload-section") loadMaterialsList();
      if (targetSection === "questions-section") loadQuestions();
      if (targetSection === "create-quiz-section") refreshQuizBankStats();
      if (targetSection === "analytics-section") loadTeacherAnalytics();
    });
  });
}

// 1. Dashboard Overview Stats & Recent Activity
async function loadDashboardData() {
  try {
    const res = await fetch(`${API_BASE}/api/analytics/teacher`, {
      headers: Auth.getHeaders(),
    });
    const data = await res.json();

    if (data.success && data.summary) {
      document.getElementById("stat-total-quizzes").textContent = data.summary.totalQuizzes;
      document.getElementById("stat-total-questions").textContent = data.summary.totalQuestions;
      document.getElementById("stat-total-students").textContent = data.summary.totalStudents;
      document.getElementById("stat-avg-score").textContent = `${data.summary.averageScorePercentage}%`;

      renderRecentActivity(data.recentActivity || []);
    }
  } catch (err) {
    console.error("Dashboard data error:", err);
  }
}

function renderRecentActivity(activities) {
  const tbody = document.getElementById("recent-activity-tbody");
  if (!tbody) return;

  if (activities.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding: 24px;">No student quiz attempts recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = activities
    .map(
      (a) => `
    <tr>
      <td style="font-weight: 600;">${a.studentName}</td>
      <td>${a.quizTitle}</td>
      <td><span class="badge ${a.percentage >= 50 ? "badge-approved" : "badge-rejected"}">${a.score}/${a.total} (${a.percentage}%)</span></td>
      <td><span class="badge ${a.status === "completed" ? "badge-approved" : "badge-pending"}">${a.status}</span></td>
      <td>${formatDate(a.date)}</td>
    </tr>
  `
    )
    .join("");
}

// 2. Upload PDF & AI Generation
function setupUploadForm() {
  const form = document.getElementById("pdf-upload-form");
  const fileInput = document.getElementById("pdf-file-input");
  const fileNameDisplay = document.getElementById("file-name-display");
  const uploadBtn = document.getElementById("upload-submit-btn");

  if (!form || !fileInput) return;

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        showToast("Please select a valid PDF file.", "error");
        fileInput.value = "";
        fileNameDisplay.textContent = "";
        return;
      }
      fileNameDisplay.textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    } else {
      fileNameDisplay.textContent = "";
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!fileInput.files.length) {
      showToast("Please choose a PDF document to upload.", "error");
      return;
    }

    const formData = new FormData(form);
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = `<span class="spinner"></span> Processing with Gemini AI...`;

    try {
      const res = await fetch(`${API_BASE}/api/materials/upload`, {
        method: "POST",
        headers: Auth.getHeaders(),
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        showToast(
          data.generatedQuestionsCount > 0
            ? `Uploaded and generated ${data.generatedQuestionsCount} MCQs with Gemini!`
            : "PDF uploaded successfully!",
          "success"
        );
        form.reset();
        fileNameDisplay.textContent = "";
        loadMaterialsList();
      } else {
        showToast(data.message || "Failed to upload PDF.", "error");
      }
    } catch (err) {
      showToast("Server error during upload: " + err.message, "error");
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = `<span>Upload & Generate MCQs</span>`;
    }
  });
}

async function loadMaterialsList() {
  const listContainer = document.getElementById("materials-list-container");
  if (!listContainer) return;

  try {
    const res = await fetch(`${API_BASE}/api/materials`, { headers: Auth.getHeaders() });
    const data = await res.json();

    if (!data.success || !data.materials.length) {
      listContainer.innerHTML = `<p style="color:var(--text-muted); padding: 16px;">No study materials uploaded yet.</p>`;
      return;
    }

    currentMaterials = data.materials;
    listContainer.innerHTML = data.materials
      .map(
        (m) => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:14px; border:1px solid var(--border-color); border-radius:var(--radius-md); margin-bottom:10px; background:white;">
        <div>
          <div style="font-weight:600; font-size:15px;">${m.title}</div>
          <div style="font-size:12px; color:var(--text-muted);">${m.file_name} • Uploaded ${formatDate(m.created_at)} • ${m.questionCount || 0} Questions</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="triggerAIGeneration('${m.id}')">🤖 Generate More MCQs</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMaterial('${m.id}')">Delete</button>
        </div>
      </div>
    `
      )
      .join("");
  } catch (err) {
    console.error("Materials load error:", err);
  }
}

async function triggerAIGeneration(materialId) {
  const count = prompt("How many MCQs would you like Gemini to generate?", "5");
  if (!count) return;

  showToast("Gemini is reading the PDF and generating structured MCQs...", "info");

  try {
    const res = await fetch(`${API_BASE}/api/questions/generate`, {
      method: "POST",
      headers: { ...Auth.getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ materialId, count: parseInt(count, 10) || 5 }),
    });
    const data = await res.json();

    if (data.success) {
      showToast(`Generated ${data.questions.length} new MCQs! Added to Question Bank.`, "success");
      loadMaterialsList();
    } else {
      showToast(data.message || "Question generation failed.", "error");
    }
  } catch (err) {
    showToast("Error generating questions: " + err.message, "error");
  }
}

async function deleteMaterial(id) {
  if (!confirm("Are you sure you want to delete this study material?")) return;
  try {
    const res = await fetch(`${API_BASE}/api/materials/${id}`, {
      method: "DELETE",
      headers: Auth.getHeaders(),
    });
    const data = await res.json();
    if (data.success) {
      showToast("Material deleted.", "success");
      loadMaterialsList();
    }
  } catch (err) {
    showToast("Delete error: " + err.message, "error");
  }
}

// 3. Question Bank Management (Approve, Reject, Edit, Delete)
function setupQuestionBankFilters() {
  const searchInput = document.getElementById("question-search-input");
  const statusFilter = document.getElementById("filter-status");
  const difficultyFilter = document.getElementById("filter-difficulty");

  if (searchInput) searchInput.addEventListener("input", filterAndRenderQuestions);
  if (statusFilter) statusFilter.addEventListener("change", loadQuestions);
  if (difficultyFilter) difficultyFilter.addEventListener("change", loadQuestions);
}

async function loadQuestions() {
  const status = document.getElementById("filter-status")?.value || "all";
  const difficulty = document.getElementById("filter-difficulty")?.value || "all";
  const container = document.getElementById("questions-container");

  if (!container) return;
  container.innerHTML = `<div style="text-align:center; padding: 40px;"><span class="spinner"></span> Loading Question Bank...</div>`;

  try {
    const url = new URL(`${API_BASE}/api/questions`);
    if (status !== "all") url.searchParams.append("status", status);
    if (difficulty !== "all") url.searchParams.append("difficulty", difficulty);

    const res = await fetch(url, { headers: Auth.getHeaders() });
    const data = await res.json();

    if (data.success) {
      currentQuestions = data.questions;
      filterAndRenderQuestions();
      refreshQuizBankStats();
    }
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger); padding:20px;">Failed to load questions: ${err.message}</p>`;
  }
}

function filterAndRenderQuestions() {
  const query = (document.getElementById("question-search-input")?.value || "").toLowerCase();
  const container = document.getElementById("questions-container");

  const filtered = currentQuestions.filter(
    (q) =>
      q.question_text.toLowerCase().includes(query) ||
      q.explanation.toLowerCase().includes(query) ||
      q.options.some((opt) => opt.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 40px; background:white; border-radius:var(--radius-md); border:1px solid var(--border-color);">
        <p style="color:var(--text-muted); font-size:16px;">No questions found matching your criteria.</p>
        <p style="font-size:13px; color:var(--text-light); margin-top:6px;">Upload a PDF to generate questions with Gemini.</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map((q) => {
      const diffClass =
        q.difficulty === "Easy" ? "badge-easy" : q.difficulty === "Medium" ? "badge-medium" : "badge-hard";
      const statusClass =
        q.status === "approved" ? "badge-approved" : q.status === "rejected" ? "badge-rejected" : "badge-pending";

      return `
      <div class="question-card" id="q-card-${q.id}">
        <div class="question-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge ${diffClass}">${q.difficulty}</span>
            <span class="badge ${statusClass}">${q.status}</span>
          </div>
          <div style="font-size:12px; color:var(--text-muted);">
            ${q.study_materials?.title ? `From: ${q.study_materials.title}` : ""}
          </div>
        </div>

        <div class="question-text">${q.question_text}</div>

        <div class="question-options-grid">
          ${q.options
            .map((opt, idx) => {
              const isCorrect = opt.trim() === q.correct_answer.trim();
              const letter = String.fromCharCode(65 + idx);
              return `
                <div class="option-pill ${isCorrect ? "correct" : ""}">
                  <strong>[${letter}]</strong> ${opt} ${isCorrect ? "✓ (Correct)" : ""}
                </div>
              `;
            })
            .join("")}
        </div>

        <div class="explanation-box">
          <strong>Explanation:</strong> ${q.explanation}
        </div>

        <div class="question-actions">
          ${
            q.status !== "approved"
              ? `<button class="btn btn-success btn-sm" onclick="setQuestionStatus('${q.id}', 'approved')">✓ Approve</button>`
              : ""
          }
          ${
            q.status !== "rejected"
              ? `<button class="btn btn-danger btn-sm" onclick="setQuestionStatus('${q.id}', 'rejected')">✕ Reject</button>`
              : ""
          }
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${q.id}')">✎ Edit</button>
          <button class="btn btn-secondary btn-sm" style="color:var(--danger);" onclick="deleteQuestion('${q.id}')">Delete</button>
        </div>
      </div>
    `;
    })
    .join("");
}

async function setQuestionStatus(id, status) {
  try {
    const res = await fetch(`${API_BASE}/api/questions/${id}/status`, {
      method: "PATCH",
      headers: { ...Auth.getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Question marked as ${status}.`, "success");
      // Update local state
      const target = currentQuestions.find((q) => q.id === id);
      if (target) target.status = status;
      filterAndRenderQuestions();
      refreshQuizBankStats();
    }
  } catch (err) {
    showToast("Status update failed: " + err.message, "error");
  }
}

async function deleteQuestion(id) {
  if (!confirm("Are you sure you want to delete this question?")) return;
  try {
    const res = await fetch(`${API_BASE}/api/questions/${id}`, {
      method: "DELETE",
      headers: Auth.getHeaders(),
    });
    const data = await res.json();
    if (data.success) {
      showToast("Question deleted.", "success");
      currentQuestions = currentQuestions.filter((q) => q.id !== id);
      filterAndRenderQuestions();
      refreshQuizBankStats();
    }
  } catch (err) {
    showToast("Delete failed: " + err.message, "error");
  }
}

// Edit Modal
function setupEditQuestionModal() {
  const form = document.getElementById("edit-question-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!editingQuestionId) return;

    const question_text = document.getElementById("edit-q-text").value;
    const optA = document.getElementById("edit-opt-0").value;
    const optB = document.getElementById("edit-opt-1").value;
    const optC = document.getElementById("edit-opt-2").value;
    const optD = document.getElementById("edit-opt-3").value;
    const correctRadio = document.querySelector('input[name="edit-correct-opt"]:checked')?.value;
    const difficulty = document.getElementById("edit-difficulty").value;
    const explanation = document.getElementById("edit-explanation").value;

    const options = [optA, optB, optC, optD];
    const correct_answer = options[parseInt(correctRadio, 10)];

    try {
      const res = await fetch(`${API_BASE}/api/questions/${editingQuestionId}`, {
        method: "PUT",
        headers: { ...Auth.getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text,
          options,
          correct_answer,
          difficulty,
          explanation,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Question updated successfully.", "success");
        closeModal("edit-question-modal");
        loadQuestions();
      }
    } catch (err) {
      showToast("Failed to update question: " + err.message, "error");
    }
  });
}

function openEditModal(id) {
  const q = currentQuestions.find((item) => item.id === id);
  if (!q) return;

  editingQuestionId = id;
  document.getElementById("edit-q-text").value = q.question_text;
  document.getElementById("edit-opt-0").value = q.options[0] || "";
  document.getElementById("edit-opt-1").value = q.options[1] || "";
  document.getElementById("edit-opt-2").value = q.options[2] || "";
  document.getElementById("edit-opt-3").value = q.options[3] || "";

  // Check correct option radio
  const matchIdx = q.options.findIndex((opt) => opt.trim() === q.correct_answer.trim());
  const radioToSelect = document.getElementById(`radio-opt-${matchIdx >= 0 ? matchIdx : 0}`);
  if (radioToSelect) radioToSelect.checked = true;

  document.getElementById("edit-difficulty").value = q.difficulty;
  document.getElementById("edit-explanation").value = q.explanation;

  openModal("edit-question-modal");
}

// 4. Quiz Creation with Difficulty Distribution Controls
async function refreshQuizBankStats() {
  try {
    const res = await fetch(`${API_BASE}/api/questions/stats`, { headers: Auth.getHeaders() });
    const data = await res.json();

    if (data.success && data.stats) {
      const { approved, easy, medium, hard } = data.stats;
      const statElem = document.getElementById("quiz-pool-stats");
      if (statElem) {
        statElem.innerHTML = `
          Approved Pool Available: <strong>${approved}</strong> questions 
          (<span style="color:#047857;">${easy} Easy</span>, 
           <span style="color:#b45309;">${medium} Medium</span>, 
           <span style="color:#b91c1c;">${hard} Hard</span>)
        `;
      }
    }
  } catch (err) {
    console.error("Stats error:", err);
  }
}

function setupQuizCreationForm() {
  const form = document.getElementById("create-quiz-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("quiz-title").value;
    const description = document.getElementById("quiz-description").value;
    const duration_minutes = parseInt(document.getElementById("quiz-duration").value, 10) || 15;
    const easy_count = parseInt(document.getElementById("quiz-easy-count").value, 10) || 0;
    const medium_count = parseInt(document.getElementById("quiz-medium-count").value, 10) || 0;
    const hard_count = parseInt(document.getElementById("quiz-hard-count").value, 10) || 0;
    const is_published = document.getElementById("quiz-is-published").checked;

    const total = easy_count + medium_count + hard_count;
    if (total === 0) {
      showToast("Please specify at least 1 question across Easy, Medium, or Hard.", "error");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/quizzes`, {
        method: "POST",
        headers: { ...Auth.getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          duration_minutes,
          easy_count,
          medium_count,
          hard_count,
          is_published,
        }),
      });
      const data = await res.json();

      if (data.success) {
        showToast("Quiz created successfully!", "success");
        form.reset();
        loadTeacherQuizzesList();
      } else {
        showToast(data.message || "Failed to create quiz.", "error");
      }
    } catch (err) {
      showToast("Error creating quiz: " + err.message, "error");
    }
  });

  loadTeacherQuizzesList();
}

async function loadTeacherQuizzesList() {
  const container = document.getElementById("teacher-quizzes-list");
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/api/quizzes/teacher`, { headers: Auth.getHeaders() });
    const data = await res.json();

    if (!data.success || !data.quizzes.length) {
      container.innerHTML = `<p style="color:var(--text-muted); padding:16px;">No quizzes created yet.</p>`;
      return;
    }

    container.innerHTML = data.quizzes
      .map(
        (q) => `
      <div style="background:white; border:1px solid var(--border-color); border-radius:var(--radius-md); padding:18px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between;">
        <div>
          <div style="font-weight:700; font-size:16px;">${q.title}</div>
          <div style="font-size:13px; color:var(--text-muted); margin-top:3px;">
            ${q.total_questions} Questions (${q.easy_count} Easy, ${q.medium_count} Med, ${q.hard_count} Hard) • ${q.duration_minutes} Mins • 
            Status: <span class="badge ${q.is_published ? "badge-approved" : "badge-pending"}">${q.is_published ? "Published" : "Draft"}</span>
          </div>
          <div style="font-size:12px; color:var(--text-light); margin-top:4px;">
            Submissions: ${q.completedCount || 0} • Avg Score: ${q.averageScorePercentage !== null ? q.averageScorePercentage + "%" : "N/A"}
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="toggleQuizPublish('${q.id}', ${!q.is_published})">
            ${q.is_published ? "Unpublish" : "Publish"}
          </button>
          <button class="btn btn-secondary btn-sm" onclick="viewQuizDeepAnalytics('${q.id}')">Analytics</button>
          <button class="btn btn-danger btn-sm" onclick="deleteQuiz('${q.id}')">Delete</button>
        </div>
      </div>
    `
      )
      .join("");
  } catch (err) {
    console.error("Quiz load error:", err);
  }
}

async function toggleQuizPublish(id, is_published) {
  try {
    const res = await fetch(`${API_BASE}/api/quizzes/${id}`, {
      method: "PUT",
      headers: { ...Auth.getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ is_published }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Quiz ${is_published ? "published" : "unpublished"}.`, "success");
      loadTeacherQuizzesList();
    }
  } catch (err) {
    showToast("Update failed: " + err.message, "error");
  }
}

async function deleteQuiz(id) {
  if (!confirm("Are you sure you want to delete this quiz?")) return;
  try {
    const res = await fetch(`${API_BASE}/api/quizzes/${id}`, {
      method: "DELETE",
      headers: Auth.getHeaders(),
    });
    const data = await res.json();
    if (data.success) {
      showToast("Quiz deleted.", "success");
      loadTeacherQuizzesList();
    }
  } catch (err) {
    showToast("Delete failed: " + err.message, "error");
  }
}

// 5. Analytics Deep-dive
async function loadTeacherAnalytics() {
  loadDashboardData();
}

async function viewQuizDeepAnalytics(quizId) {
  try {
    const res = await fetch(`${API_BASE}/api/analytics/teacher/quiz/${quizId}`, {
      headers: Auth.getHeaders(),
    });
    const data = await res.json();

    if (!data.success) {
      showToast(data.message || "Could not load quiz analytics.", "error");
      return;
    }

    const modalBody = document.getElementById("quiz-analytics-modal-body");
    if (!modalBody) return;

    modalBody.innerHTML = `
      <div style="margin-bottom:16px;">
        <h3 style="font-size:18px;">${data.quiz.title}</h3>
        <p style="font-size:13px; color:var(--text-muted);">${data.quiz.totalQuestions} Questions • ${data.quiz.durationMinutes} Minutes</p>
      </div>

      <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom:20px;">
        <div class="stat-card" style="padding:14px;">
          <div class="stat-info">
            <div class="stat-label">Average Score</div>
            <div class="stat-value" style="font-size:22px;">${data.stats.averageScore}%</div>
          </div>
        </div>
        <div class="stat-card" style="padding:14px;">
          <div class="stat-info">
            <div class="stat-label">Highest Score</div>
            <div class="stat-value" style="font-size:22px; color:var(--success);">${data.stats.highestScore}%</div>
          </div>
        </div>
        <div class="stat-card" style="padding:14px;">
          <div class="stat-info">
            <div class="stat-label">Submissions</div>
            <div class="stat-value" style="font-size:22px;">${data.stats.totalCompleted}</div>
          </div>
        </div>
      </div>

      <h4 style="font-size:14px; margin-bottom:8px;">Question-Level Performance</h4>
      <div class="table-responsive" style="max-height:220px; overflow-y:auto; margin-bottom:20px;">
        <table class="table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Difficulty</th>
              <th>Accuracy Rate</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.questionPerformance.length === 0
                ? `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">No answers submitted yet.</td></tr>`
                : data.questionPerformance
                    .map(
                      (qp) => `
                <tr>
                  <td style="font-size:13px;">${qp.questionText.substring(0, 60)}...</td>
                  <td><span class="badge ${qp.difficulty === "Easy" ? "badge-easy" : qp.difficulty === "Medium" ? "badge-medium" : "badge-hard"}">${qp.difficulty}</span></td>
                  <td><strong>${qp.accuracyPercentage}%</strong> (${qp.timesAnswered} attempts)</td>
                </tr>
              `
                    )
                    .join("")
            }
          </tbody>
        </table>
      </div>

      <h4 style="font-size:14px; margin-bottom:8px;">Student Submissions</h4>
      <div class="table-responsive" style="max-height:180px; overflow-y:auto;">
        <table class="table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Score</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.studentSubmissions.length === 0
                ? `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">No student attempts yet.</td></tr>`
                : data.studentSubmissions
                    .map(
                      (sub) => `
                <tr>
                  <td>${sub.studentName}</td>
                  <td><span class="badge ${sub.percentage >= 50 ? "badge-approved" : "badge-rejected"}">${sub.score}/${sub.total} (${sub.percentage}%)</span></td>
                  <td>${formatDate(sub.completedAt)}</td>
                </tr>
              `
                    )
                    .join("")
            }
          </tbody>
        </table>
      </div>
    `;

    openModal("quiz-analytics-modal");
  } catch (err) {
    showToast("Analytics error: " + err.message, "error");
  }
}
