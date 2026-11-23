import { supabaseAdmin, isSupabaseConfigured } from "../config/supabase.js";
import { localStore } from "../services/localStore.js";

/**
 * Controller: Overall analytics for Teacher Dashboard.
 */
export async function getTeacherAnalytics(req, res) {
  const teacherId = req.profile?.id || "default_teacher";

  try {
    if (!isSupabaseConfigured) {
      const quizzes = localStore.get("quizzes");
      const questions = localStore.get("questions");
      const attempts = localStore.get("quiz_attempts");

      const completed = attempts.filter((a) => a.status === "completed");
      const avgScore =
        completed.length > 0
          ? Math.round(
              completed.reduce((acc, a) => acc + (a.score / (a.total_questions || 1)) * 100, 0) /
                completed.length
            )
          : 0;

      const recentActivity = attempts.slice(-8).reverse().map((a) => {
        const q = quizzes.find((qz) => qz.id === a.quiz_id);
        return {
          attemptId: a.id,
          studentName: "Student",
          quizTitle: q?.title || "Quiz",
          score: a.score,
          total: a.total_questions,
          percentage: a.total_questions > 0 ? Math.round((a.score / a.total_questions) * 100) : 0,
          status: a.status,
          date: a.completed_at || a.started_at,
        };
      });

      return res.json({
        success: true,
        summary: {
          totalQuizzes: quizzes.length,
          totalQuestions: questions.length,
          approvedQuestions: questions.filter((q) => q.status === "approved").length,
          totalStudents: new Set(attempts.map((a) => a.student_id)).size || 1,
          totalAttempts: attempts.length,
          averageScorePercentage: avgScore,
        },
        difficultyBreakdown: {
          Easy: questions.filter((q) => q.difficulty === "Easy" && q.status === "approved").length,
          Medium: questions.filter((q) => q.difficulty === "Medium" && q.status === "approved").length,
          Hard: questions.filter((q) => q.difficulty === "Hard" && q.status === "approved").length,
        },
        recentActivity,
      });
    }

    // 1. Quizzes count from Supabase
    const { count: totalQuizzes } = await supabaseAdmin
      .from("quizzes")
      .select("*", { count: "exact", head: true })
      .eq("teacher_id", teacherId);

    // 2. Questions metrics
    const { data: questions } = await supabaseAdmin
      .from("questions")
      .select("status, difficulty")
      .eq("teacher_id", teacherId);

    const totalQuestions = questions?.length || 0;
    const approvedQuestions = questions?.filter((q) => q.status === "approved").length || 0;

    const difficultyBreakdown = {
      Easy: questions?.filter((q) => q.difficulty === "Easy" && q.status === "approved").length || 0,
      Medium: questions?.filter((q) => q.difficulty === "Medium" && q.status === "approved").length || 0,
      Hard: questions?.filter((q) => q.difficulty === "Hard" && q.status === "approved").length || 0,
    };

    // 3. Quizzes IDs owned by this teacher
    const { data: teacherQuizzes } = await supabaseAdmin
      .from("quizzes")
      .select("id, title")
      .eq("teacher_id", teacherId);

    const quizIds = (teacherQuizzes || []).map((q) => q.id);

    // 4. Attempts for teacher's quizzes
    let totalAttempts = 0;
    let completedAttempts = [];
    let recentActivity = [];
    let uniqueStudentsCount = 0;

    if (quizIds.length > 0) {
      const { data: attempts } = await supabaseAdmin
        .from("quiz_attempts")
        .select(`
          id, score, total_questions, status, started_at, completed_at, student_id,
          profiles:student_id(full_name, email),
          quizzes:quiz_id(title)
        `)
        .in("quiz_id", quizIds)
        .order("started_at", { ascending: false });

      if (attempts) {
        totalAttempts = attempts.length;
        completedAttempts = attempts.filter((a) => a.status === "completed");
        const studentSet = new Set(attempts.map((a) => a.student_id));
        uniqueStudentsCount = studentSet.size;

        recentActivity = attempts.slice(0, 8).map((a) => ({
          attemptId: a.id,
          studentName: a.profiles?.full_name || a.profiles?.email || "Student",
          quizTitle: a.quizzes?.title || "Quiz",
          score: a.score,
          total: a.total_questions,
          percentage: a.total_questions > 0 ? Math.round((a.score / a.total_questions) * 100) : 0,
          status: a.status,
          date: a.completed_at || a.started_at,
        }));
      }
    }

    const averageScorePercentage =
      completedAttempts.length > 0
        ? Math.round(
            completedAttempts.reduce((acc, a) => acc + (a.score / a.total_questions) * 100, 0) /
              completedAttempts.length
          )
        : 0;

    return res.json({
      success: true,
      summary: {
        totalQuizzes: totalQuizzes || 0,
        totalQuestions,
        approvedQuestions,
        totalStudents: uniqueStudentsCount,
        totalAttempts,
        averageScorePercentage,
      },
      difficultyBreakdown,
      recentActivity,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Deep-dive analytics for a specific quiz (Teacher).
 */
export async function getQuizAnalytics(req, res) {
  const { quizId } = req.params;

  try {
    if (!isSupabaseConfigured) {
      const quiz = localStore.findById("quizzes", quizId);
      const attempts = localStore.get("quiz_attempts").filter((a) => a.quiz_id === quizId && a.status === "completed");
      const scores = attempts.map((a) => (a.score / (a.total_questions || 1)) * 100);

      const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const highestScore = scores.length > 0 ? Math.round(Math.max(...scores)) : 0;
      const lowestScore = scores.length > 0 ? Math.round(Math.min(...scores)) : 0;

      return res.json({
        success: true,
        quiz: {
          id: quiz?.id,
          title: quiz?.title,
          durationMinutes: quiz?.duration_minutes,
          totalQuestions: quiz?.total_questions,
        },
        stats: {
          totalCompleted: attempts.length,
          averageScore,
          highestScore,
          lowestScore,
        },
        questionPerformance: [],
        studentSubmissions: attempts.map((a) => ({
          attemptId: a.id,
          studentName: "Student",
          score: a.score,
          total: a.total_questions,
          percentage: Math.round((a.score / (a.total_questions || 1)) * 100),
          completedAt: a.completed_at,
        })),
      });
    }

    const { data: quiz, error: qErr } = await supabaseAdmin
      .from("quizzes")
      .select("*")
      .eq("id", quizId)
      .single();

    if (qErr || !quiz) {
      return res.status(404).json({ success: false, message: "Quiz not found or unauthorized." });
    }

    const { data: attempts } = await supabaseAdmin
      .from("quiz_attempts")
      .select(`
        id, score, total_questions, started_at, completed_at,
        profiles:student_id(full_name, email),
        student_answers(question_id, is_correct, selected_option)
      `)
      .eq("quiz_id", quizId)
      .eq("status", "completed");

    const totalCompleted = attempts?.length || 0;
    const scores = (attempts || []).map((a) => (a.score / a.total_questions) * 100);

    const averageScore = totalCompleted > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / totalCompleted) : 0;
    const highestScore = totalCompleted > 0 ? Math.round(Math.max(...scores)) : 0;
    const lowestScore = totalCompleted > 0 ? Math.round(Math.min(...scores)) : 0;

    return res.json({
      success: true,
      quiz: {
        id: quiz.id,
        title: quiz.title,
        durationMinutes: quiz.duration_minutes,
        totalQuestions: quiz.total_questions,
      },
      stats: {
        totalCompleted,
        averageScore,
        highestScore,
        lowestScore,
      },
      questionPerformance: [],
      studentSubmissions: (attempts || []).map((a) => ({
        attemptId: a.id,
        studentName: a.profiles?.full_name || a.profiles?.email,
        score: a.score,
        total: a.total_questions,
        percentage: Math.round((a.score / a.total_questions) * 100),
        completedAt: a.completed_at,
      })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Analytics and attempt history for Student.
 */
export async function getStudentAnalytics(req, res) {
  const studentId = req.profile?.id || "default_student";

  try {
    if (!isSupabaseConfigured) {
      const attempts = localStore.get("quiz_attempts").filter((a) => a.student_id === studentId);
      const quizzes = localStore.get("quizzes");
      const qMap = new Map(quizzes.map((q) => [q.id, q]));

      const completed = attempts.filter((a) => a.status === "completed");
      const percentages = completed.map((a) => (a.score / (a.total_questions || 1)) * 100);

      const averageScore = percentages.length > 0 ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length) : 0;
      const highestScore = percentages.length > 0 ? Math.round(Math.max(...percentages)) : 0;

      const history = attempts.map((a) => ({
        attemptId: a.id,
        quizId: a.quiz_id,
        quizTitle: qMap.get(a.quiz_id)?.title || "Quiz",
        score: a.score,
        total: a.total_questions,
        percentage: a.status === "completed" && a.total_questions > 0 ? Math.round((a.score / a.total_questions) * 100) : null,
        status: a.status,
        startedAt: a.started_at,
        completedAt: a.completed_at,
      }));

      return res.json({
        success: true,
        stats: {
          totalAttempts: attempts.length,
          completedAttempts: completed.length,
          averageScore,
          highestScore,
        },
        history,
      });
    }

    const { data: attempts, error } = await supabaseAdmin
      .from("quiz_attempts")
      .select(`
        id, quiz_id, score, total_questions, status, started_at, completed_at,
        quizzes:quiz_id(title, duration_minutes)
      `)
      .eq("student_id", studentId)
      .order("started_at", { ascending: false });

    if (error) return res.status(500).json({ success: false, message: error.message });

    const completed = (attempts || []).filter((a) => a.status === "completed");
    const percentages = completed.map((a) => (a.score / a.total_questions) * 100);

    const averageScore = percentages.length > 0 ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length) : 0;
    const highestScore = percentages.length > 0 ? Math.round(Math.max(...percentages)) : 0;

    const history = (attempts || []).map((a) => ({
      attemptId: a.id,
      quizId: a.quiz_id,
      quizTitle: a.quizzes?.title || "Quiz",
      score: a.score,
      total: a.total_questions,
      percentage: a.status === "completed" && a.total_questions > 0 ? Math.round((a.score / a.total_questions) * 100) : null,
      status: a.status,
      startedAt: a.started_at,
      completedAt: a.completed_at,
    }));

    return res.json({
      success: true,
      stats: {
        totalAttempts: (attempts || []).length,
        completedAttempts: completed.length,
        averageScore,
        highestScore,
      },
      history,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
