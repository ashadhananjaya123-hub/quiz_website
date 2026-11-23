import { supabaseAdmin, isSupabaseConfigured } from "../config/supabase.js";
import {
  selectRandomQuestionsWithDistribution,
  sanitizeQuestionsForStudent,
  evaluateAttempt,
} from "../services/quizService.js";
import { localStore } from "../services/localStore.js";

/**
 * Controller: Create a new Quiz (Teacher).
 */
export async function createQuiz(req, res) {
  const teacherId = req.profile?.id || "default_teacher";
  const {
    title,
    description,
    duration_minutes = 15,
    easy_count = 0,
    medium_count = 0,
    hard_count = 0,
    question_ids = [],
    is_published = false,
  } = req.body;

  if (!title || title.trim().length === 0) {
    return res.status(400).json({ success: false, message: "Quiz title is required." });
  }

  const easyNum = parseInt(easy_count, 10) || 0;
  const medNum = parseInt(medium_count, 10) || 0;
  const hardNum = parseInt(hard_count, 10) || 0;
  const totalQuestions = easyNum + medNum + hardNum;

  if (totalQuestions <= 0) {
    return res.status(400).json({
      success: false,
      message: "Total questions must be greater than 0. Specify easy, medium, or hard counts.",
    });
  }

  try {
    if (!isSupabaseConfigured) {
      const quiz = localStore.insert("quizzes", {
        teacher_id: teacherId,
        title: title.trim(),
        description: description ? description.trim() : null,
        duration_minutes: parseInt(duration_minutes, 10) || 15,
        total_questions: totalQuestions,
        easy_count: easyNum,
        medium_count: medNum,
        hard_count: hardNum,
        is_published: Boolean(is_published),
      });

      return res.status(201).json({
        success: true,
        message: "Quiz created successfully.",
        quiz,
      });
    }

    // 1. Insert Quiz Record into Supabase
    const { data: quiz, error: quizError } = await supabaseAdmin
      .from("quizzes")
      .insert({
        teacher_id: teacherId,
        title: title.trim(),
        description: description ? description.trim() : null,
        duration_minutes: parseInt(duration_minutes, 10) || 15,
        total_questions: totalQuestions,
        easy_count: easyNum,
        medium_count: medNum,
        hard_count: hardNum,
        is_published: Boolean(is_published),
      })
      .select()
      .single();

    if (quizError) {
      return res.status(500).json({ success: false, message: quizError.message });
    }

    // 2. Link approved questions if provided, or link all teacher's approved questions to this quiz
    if (Array.isArray(question_ids) && question_ids.length > 0) {
      const links = question_ids.map((qid) => ({
        quiz_id: quiz.id,
        question_id: qid,
      }));
      await supabaseAdmin.from("quiz_questions").insert(links);
    } else {
      const { data: approved } = await supabaseAdmin
        .from("questions")
        .select("id")
        .eq("teacher_id", teacherId)
        .eq("status", "approved");

      if (approved && approved.length > 0) {
        const links = approved.map((q) => ({ quiz_id: quiz.id, question_id: q.id }));
        await supabaseAdmin.from("quiz_questions").insert(links);
      }
    }

    return res.status(201).json({
      success: true,
      message: "Quiz created successfully.",
      quiz,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Get quizzes created by logged-in teacher.
 */
export async function getTeacherQuizzes(req, res) {
  const teacherId = req.profile?.id || "default_teacher";

  try {
    if (!isSupabaseConfigured) {
      const quizzes = localStore.get("quizzes");
      const attempts = localStore.get("quiz_attempts");

      const enriched = quizzes.map((q) => {
        const qAttempts = attempts.filter((a) => a.quiz_id === q.id);
        const completed = qAttempts.filter((a) => a.status === "completed");
        const avgScore =
          completed.length > 0
            ? Math.round(
                completed.reduce((acc, a) => acc + (a.score / q.total_questions) * 100, 0) / completed.length
              )
            : null;

        return {
          ...q,
          attemptsCount: qAttempts.length,
          completedCount: completed.length,
          averageScorePercentage: avgScore,
        };
      });

      return res.json({ success: true, quizzes: enriched });
    }

    const { data: quizzes, error } = await supabaseAdmin
      .from("quizzes")
      .select(`
        *,
        quiz_attempts:quiz_attempts!fk_quiz_attempts_quiz(id, score, status),
        quiz_questions:quiz_questions(count)
      `)
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ success: false, message: error.message });

    const enriched = quizzes.map((q) => {
      const completedAttempts = q.quiz_attempts?.filter((a) => a.status === "completed") || [];
      const totalAttempts = q.quiz_attempts?.length || 0;
      const avgScore =
        completedAttempts.length > 0
          ? Math.round(
              completedAttempts.reduce((acc, a) => acc + (a.score / q.total_questions) * 100, 0) /
                completedAttempts.length
            )
          : null;

      return {
        ...q,
        attemptsCount: totalAttempts,
        completedCount: completedAttempts.length,
        averageScorePercentage: avgScore,
        poolSize: q.quiz_questions?.[0]?.count || 0,
      };
    });

    return res.json({ success: true, quizzes: enriched });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Get published quizzes for students.
 */
export async function getStudentQuizzes(req, res) {
  const studentId = req.profile?.id || "default_student";

  try {
    if (!isSupabaseConfigured) {
      const quizzes = localStore.get("quizzes").filter((q) => q.is_published);
      const attempts = localStore.get("quiz_attempts");

      const formatted = quizzes.map((q) => {
        const studentAttempts = attempts.filter((a) => a.quiz_id === q.id && a.student_id === studentId);
        const latestAttempt = studentAttempts[studentAttempts.length - 1] || null;

        return {
          id: q.id,
          title: q.title,
          description: q.description,
          durationMinutes: q.duration_minutes,
          totalQuestions: q.total_questions,
          distribution: {
            easy: q.easy_count,
            medium: q.medium_count,
            hard: q.hard_count,
          },
          teacherName: "Instructor",
          latestAttempt,
        };
      });

      return res.json({ success: true, quizzes: formatted });
    }

    const { data: quizzes, error } = await supabaseAdmin
      .from("quizzes")
      .select(`
        id, title, description, duration_minutes, total_questions, easy_count, medium_count, hard_count, created_at,
        profiles:profiles!fk_quizzes_teacher(full_name),
        attempts:quiz_attempts!fk_quiz_attempts_quiz(id, status, score, completed_at, student_id)
      `)
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ success: false, message: error.message });

    const formatted = quizzes.map((q) => {
      const latestAttempt = (q.attempts || [])[0] || null;

      return {
        id: q.id,
        title: q.title,
        description: q.description,
        durationMinutes: q.duration_minutes,
        totalQuestions: q.total_questions,
        distribution: {
          easy: q.easy_count,
          medium: q.medium_count,
          hard: q.hard_count,
        },
        teacherName: q.profiles?.full_name || "Instructor",
        latestAttempt,
      };
    });

    return res.json({ success: true, quizzes: formatted });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Toggle publish status or update quiz.
 */
export async function updateQuiz(req, res) {
  const { id } = req.params;
  const teacherId = req.profile?.id || "default_teacher";
  const { is_published, title, description, duration_minutes } = req.body;

  try {
    const updates = {};
    if (typeof is_published === "boolean") updates.is_published = is_published;
    if (title) updates.title = title.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (duration_minutes) updates.duration_minutes = parseInt(duration_minutes, 10);

    if (!isSupabaseConfigured) {
      const updated = localStore.update("quizzes", id, updates);
      return res.json({ success: true, quiz: updated });
    }

    const { data, error } = await supabaseAdmin
      .from("quizzes")
      .update(updates)
      .eq("id", id)
      .eq("teacher_id", teacherId)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, message: error.message });

    return res.json({ success: true, quiz: data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Delete quiz.
 */
export async function deleteQuiz(req, res) {
  const { id } = req.params;
  const teacherId = req.profile?.id || "default_teacher";

  try {
    if (!isSupabaseConfigured) {
      localStore.delete("quizzes", id);
      return res.json({ success: true, message: "Quiz deleted." });
    }

    const { error } = await supabaseAdmin
      .from("quizzes")
      .delete()
      .eq("id", id)
      .eq("teacher_id", teacherId);

    if (error) return res.status(500).json({ success: false, message: error.message });

    return res.json({ success: true, message: "Quiz deleted successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Start a Quiz Attempt (Student).
 * Implements SECURE BACKEND RANDOMIZATION WITH GUARANTEED DIFFICULTY DISTRIBUTION.
 */
export async function startQuizAttempt(req, res) {
  const { quizId } = req.body;
  const studentId = req.profile?.id || "default_student";

  try {
    let quiz = null;
    let approvedPool = [];

    if (!isSupabaseConfigured) {
      quiz = localStore.findById("quizzes", quizId);
      if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found." });

      const allQs = localStore.get("questions");
      approvedPool = allQs.filter((q) => q.status === "approved");
      // Fallback: if none approved yet, use any available questions for testing
      if (approvedPool.length === 0) approvedPool = allQs;

      if (approvedPool.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No questions in the question bank. Please ask your instructor to upload a PDF and generate questions.",
        });
      }

      // Check active attempt
      const attempts = localStore.get("quiz_attempts");
      const active = attempts.find((a) => a.quiz_id === quizId && a.student_id === studentId && a.status === "in_progress");

      if (active) {
        const assignedIds = active.assigned_question_ids;
        const qMap = new Map(approvedPool.map((q) => [q.id, q]));
        const ordered = assignedIds.map((id) => qMap.get(id)).filter(Boolean);

        const elapsedSeconds = Math.floor((Date.now() - new Date(active.started_at).getTime()) / 1000);
        const totalSeconds = quiz.duration_minutes * 60;
        const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

        return res.json({
          success: true,
          isResumed: true,
          attemptId: active.id,
          quiz: {
            id: quiz.id,
            title: quiz.title,
            description: quiz.description,
            durationMinutes: quiz.duration_minutes,
            remainingSeconds,
            totalQuestions: ordered.length,
          },
          questions: sanitizeQuestionsForStudent(ordered),
        });
      }

      const assignedQuestionIds = selectRandomQuestionsWithDistribution(quiz, approvedPool);
      const newAttempt = localStore.insert("quiz_attempts", {
        quiz_id: quiz.id,
        student_id: studentId,
        assigned_question_ids: assignedQuestionIds,
        total_questions: assignedQuestionIds.length,
        status: "in_progress",
        started_at: new Date().toISOString(),
      });

      const qMap = new Map(approvedPool.map((q) => [q.id, q]));
      const studentQuestionList = assignedQuestionIds.map((id) => qMap.get(id)).filter(Boolean);

      return res.json({
        success: true,
        isResumed: false,
        attemptId: newAttempt.id,
        quiz: {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          durationMinutes: quiz.duration_minutes,
          remainingSeconds: quiz.duration_minutes * 60,
          totalQuestions: studentQuestionList.length,
        },
        questions: sanitizeQuestionsForStudent(studentQuestionList),
      });
    }

    // SUPABASE MODE:
    // 1. Fetch Quiz details
    const { data: sbQuiz, error: quizErr } = await supabaseAdmin
      .from("quizzes")
      .select("*")
      .eq("id", quizId)
      .single();

    if (quizErr || !sbQuiz) {
      return res.status(404).json({ success: false, message: "Quiz not found." });
    }
    quiz = sbQuiz;

    // 2. Check for an ACTIVE in-progress attempt for this student
    const { data: activeAttempt } = await supabaseAdmin
      .from("quiz_attempts")
      .select("*")
      .eq("quiz_id", quizId)
      .eq("student_id", studentId)
      .eq("status", "in_progress")
      .maybeSingle();

    if (activeAttempt) {
      const assignedIds = activeAttempt.assigned_question_ids;
      const { data: rawQuestions } = await supabaseAdmin
        .from("questions")
        .select("id, question_text, options, difficulty")
        .in("id", assignedIds);

      const questionMap = new Map((rawQuestions || []).map((q) => [q.id, q]));
      const orderedQuestions = assignedIds.map((id) => questionMap.get(id)).filter(Boolean);

      const elapsedSeconds = Math.floor((Date.now() - new Date(activeAttempt.started_at).getTime()) / 1000);
      const totalSecondsAllowed = quiz.duration_minutes * 60;
      const remainingSeconds = Math.max(0, totalSecondsAllowed - elapsedSeconds);

      return res.json({
        success: true,
        isResumed: true,
        attemptId: activeAttempt.id,
        quiz: {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          durationMinutes: quiz.duration_minutes,
          remainingSeconds,
          totalQuestions: orderedQuestions.length,
        },
        questions: sanitizeQuestionsForStudent(orderedQuestions),
      });
    }

    // 3. New Attempt: Fetch pool of approved questions
    const { data: fallbackQuestions } = await supabaseAdmin
      .from("questions")
      .select("*")
      .eq("teacher_id", quiz.teacher_id)
      .eq("status", "approved");

    approvedPool = fallbackQuestions || [];

    if (approvedPool.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No approved questions are available for this quiz. Contact your instructor.",
      });
    }

    const assignedQuestionIds = selectRandomQuestionsWithDistribution(quiz, approvedPool);

    const { data: newAttempt, error: attemptError } = await supabaseAdmin
      .from("quiz_attempts")
      .insert({
        quiz_id: quiz.id,
        student_id: studentId,
        assigned_question_ids: assignedQuestionIds,
        total_questions: assignedQuestionIds.length,
        status: "in_progress",
      })
      .select()
      .single();

    if (attemptError) {
      return res.status(500).json({ success: false, message: attemptError.message });
    }

    const questionMap = new Map(approvedPool.map((q) => [q.id, q]));
    const studentQuestionList = assignedQuestionIds.map((id) => questionMap.get(id)).filter(Boolean);

    return res.json({
      success: true,
      isResumed: false,
      attemptId: newAttempt.id,
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        durationMinutes: quiz.duration_minutes,
        remainingSeconds: quiz.duration_minutes * 60,
        totalQuestions: studentQuestionList.length,
      },
      questions: sanitizeQuestionsForStudent(studentQuestionList),
    });
  } catch (error) {
    console.error("Start quiz error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Submit Quiz Attempt and Evaluate (Student).
 */
export async function submitQuizAttempt(req, res) {
  const { attemptId, answers = {} } = req.body;
  const studentId = req.profile?.id || "default_student";

  try {
    if (!isSupabaseConfigured) {
      const attempt = localStore.findById("quiz_attempts", attemptId);
      if (!attempt) return res.status(404).json({ success: false, message: "Attempt not found." });

      const quiz = localStore.findById("quizzes", attempt.quiz_id);
      const allQs = localStore.get("questions");
      const assignedIds = attempt.assigned_question_ids;
      const qMap = new Map(allQs.map((q) => [q.id, q]));
      const orderedQuestions = assignedIds.map((id) => qMap.get(id)).filter(Boolean);

      const evaluation = evaluateAttempt(orderedQuestions, answers);

      localStore.update("quiz_attempts", attempt.id, {
        status: "completed",
        score: evaluation.score,
        completed_at: new Date().toISOString(),
      });

      return res.json({
        success: true,
        message: "Quiz submitted and evaluated successfully.",
        result: {
          attemptId: attempt.id,
          quizTitle: quiz?.title || "Quiz",
          score: evaluation.score,
          total: evaluation.total,
          percentage: evaluation.percentage,
          review: evaluation.review,
        },
      });
    }

    // 1. Fetch attempt from Supabase
    const { data: attempt, error: aErr } = await supabaseAdmin
      .from("quiz_attempts")
      .select("*, quizzes(*)")
      .eq("id", attemptId)
      .eq("student_id", studentId)
      .single();

    if (aErr || !attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found." });
    }

    if (attempt.status === "completed") {
      return res.status(400).json({ success: false, message: "This attempt has already been submitted." });
    }

    const assignedIds = attempt.assigned_question_ids;
    const { data: questions, error: qErr } = await supabaseAdmin
      .from("questions")
      .select("id, question_text, options, correct_answer, difficulty, explanation")
      .in("id", assignedIds);

    if (qErr || !questions) {
      return res.status(500).json({ success: false, message: "Could not fetch question answer keys." });
    }

    const qMap = new Map(questions.map((q) => [q.id, q]));
    const orderedQuestions = assignedIds.map((id) => qMap.get(id)).filter(Boolean);

    const evaluation = evaluateAttempt(orderedQuestions, answers);

    const answersToInsert = evaluation.answersRecord.map((item) => ({
      attempt_id: attempt.id,
      question_id: item.question_id,
      selected_option: item.selected_option,
      is_correct: item.is_correct,
    }));

    if (answersToInsert.length > 0) {
      await supabaseAdmin.from("student_answers").insert(answersToInsert);
    }

    await supabaseAdmin
      .from("quiz_attempts")
      .update({
        status: "completed",
        score: evaluation.score,
        completed_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);

    return res.json({
      success: true,
      message: "Quiz submitted and evaluated successfully.",
      result: {
        attemptId: attempt.id,
        quizTitle: attempt.quizzes?.title,
        score: evaluation.score,
        total: evaluation.total,
        percentage: evaluation.percentage,
        review: evaluation.review,
      },
    });
  } catch (error) {
    console.error("Submit quiz error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Get results / review of a completed attempt.
 */
export async function getAttemptResult(req, res) {
  const { attemptId } = req.params;

  try {
    if (!isSupabaseConfigured) {
      const attempt = localStore.findById("quiz_attempts", attemptId);
      if (!attempt) return res.status(404).json({ success: false, message: "Attempt not found." });

      const quiz = localStore.findById("quizzes", attempt.quiz_id);
      const allQs = localStore.get("questions");
      const assignedIds = attempt.assigned_question_ids;
      const qMap = new Map(allQs.map((q) => [q.id, q]));

      const review = assignedIds.map((qid) => {
        const q = qMap.get(qid);
        return {
          id: qid,
          question_text: q?.question_text,
          options: q?.options || [],
          correct_answer: q?.correct_answer,
          difficulty: q?.difficulty,
          explanation: q?.explanation,
          selected_option: null,
          is_correct: false,
        };
      });

      const total = attempt.total_questions;
      const score = attempt.score;
      const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

      return res.json({
        success: true,
        result: {
          attemptId: attempt.id,
          quizTitle: quiz?.title || "Quiz",
          startedAt: attempt.started_at,
          completedAt: attempt.completed_at,
          score,
          total,
          percentage,
          review,
        },
      });
    }

    const { data: attempt, error } = await supabaseAdmin
      .from("quiz_attempts")
      .select(`
        *,
        quizzes(title, description, duration_minutes),
        student_answers(question_id, selected_option, is_correct)
      `)
      .eq("id", attemptId)
      .single();

    if (error || !attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found." });
    }

    const assignedIds = attempt.assigned_question_ids;
    const { data: questions } = await supabaseAdmin
      .from("questions")
      .select("id, question_text, options, correct_answer, difficulty, explanation")
      .in("id", assignedIds);

    const answerMap = new Map((attempt.student_answers || []).map((a) => [a.question_id, a]));
    const qMap = new Map((questions || []).map((q) => [q.id, q]));

    const review = assignedIds.map((qid) => {
      const q = qMap.get(qid);
      const ans = answerMap.get(qid);
      return {
        id: qid,
        question_text: q?.question_text,
        options: q?.options || [],
        correct_answer: q?.correct_answer,
        difficulty: q?.difficulty,
        explanation: q?.explanation,
        selected_option: ans?.selected_option || null,
        is_correct: ans?.is_correct || false,
      };
    });

    const total = attempt.total_questions;
    const score = attempt.score;
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

    return res.json({
      success: true,
      result: {
        attemptId: attempt.id,
        quizTitle: attempt.quizzes?.title,
        startedAt: attempt.started_at,
        completedAt: attempt.completed_at,
        score,
        total,
        percentage,
        review,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
