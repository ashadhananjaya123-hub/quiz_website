import fs from "fs";
import path from "path";
import { supabaseAdmin, isSupabaseConfigured } from "../config/supabase.js";
import { generateMCQsFromPDF } from "../services/geminiService.js";
import { localStore } from "../services/localStore.js";

/**
 * Controller: Generate questions on demand for an existing study material.
 */
export async function generateQuestions(req, res) {
  const { materialId, count = 5, customInstructions } = req.body;
  const teacherId = req.profile?.id || "default_teacher";

  try {
    let localPdfPath = "./sample.pdf"; // Fallback to sample if local

    if (isSupabaseConfigured && materialId) {
      // Find material in Supabase
      const { data: material, error: mError } = await supabaseAdmin
        .from("study_materials")
        .select("*")
        .eq("id", materialId)
        .eq("teacher_id", teacherId)
        .single();

      if (mError || !material) {
        return res.status(404).json({ success: false, message: "Study material not found." });
      }

      // Download temporary copy from Supabase Storage to feed to Gemini Files API
      if (material.storage_path) {
        const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
          .from("study-materials")
          .download(material.storage_path);

        if (!downloadError && fileBlob) {
          const tempDir = path.resolve("./temp");
          if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
          localPdfPath = path.join(tempDir, `download_${Date.now()}.pdf`);
          const arrayBuffer = await fileBlob.arrayBuffer();
          fs.writeFileSync(localPdfPath, Buffer.from(arrayBuffer));
        }
      }
    } else if (!isSupabaseConfigured && materialId) {
      const mat = localStore.findById("materials", materialId);
      if (mat?.local_file_path && fs.existsSync(mat.local_file_path)) {
        localPdfPath = mat.local_file_path;
      }
    }

    // Call Gemini Service
    console.log(`[QuestionController] Generating ${count} MCQs via Gemini for material: ${materialId || "local"}...`);
    const aiQuestions = await generateMCQsFromPDF(localPdfPath, {
      count: parseInt(count, 10) || 5,
      customInstructions,
    });

    // Cleanup temp download if created
    if (localPdfPath.includes("download_") && fs.existsSync(localPdfPath)) {
      try {
        fs.unlinkSync(localPdfPath);
      } catch (e) {}
    }

    // Save into questions table
    let savedQuestions = [];
    const rows = aiQuestions.map((q) => ({
      material_id: materialId || null,
      teacher_id: teacherId,
      question_text: q.question,
      options: q.options,
      correct_answer: q.correctAnswer,
      difficulty: q.difficulty,
      explanation: q.explanation,
      status: "pending",
    }));

    if (isSupabaseConfigured && materialId) {
      const { data, error } = await supabaseAdmin.from("questions").insert(rows).select();
      if (error) {
        return res.status(500).json({ success: false, message: "Database insert error: " + error.message });
      }
      savedQuestions = data;
    } else {
      savedQuestions = localStore.insertMany("questions", rows);
    }

    return res.json({
      success: true,
      message: `Successfully generated ${savedQuestions.length} questions.`,
      questions: savedQuestions,
    });
  } catch (error) {
    console.error("Generate questions error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate questions with AI.",
    });
  }
}

/**
 * Controller: Get questions for teacher question bank with filters.
 */
export async function getQuestions(req, res) {
  const teacherId = req.profile?.id || "default_teacher";
  const { status, difficulty, materialId, search } = req.query;

  try {
    if (!isSupabaseConfigured) {
      let questions = localStore.get("questions");
      const materials = localStore.get("materials");
      const matMap = new Map(materials.map((m) => [m.id, m]));

      let enriched = questions.map((q) => ({
        ...q,
        study_materials: q.material_id ? { title: matMap.get(q.material_id)?.title } : null,
      }));

      if (status && status !== "all") {
        enriched = enriched.filter((q) => q.status === status);
      }
      if (difficulty && difficulty !== "all") {
        enriched = enriched.filter((q) => q.difficulty === difficulty);
      }
      if (materialId) {
        enriched = enriched.filter((q) => q.material_id === materialId);
      }
      if (search) {
        const s = search.toLowerCase();
        enriched = enriched.filter((q) => q.question_text.toLowerCase().includes(s));
      }

      return res.json({ success: true, questions: enriched });
    }

    let query = supabaseAdmin
      .from("questions")
      .select("*, study_materials:study_materials!fk_questions_material(title)")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (difficulty && difficulty !== "all") {
      query = query.eq("difficulty", difficulty);
    }

    if (materialId) {
      query = query.eq("material_id", materialId);
    }

    if (search) {
      query = query.ilike("question_text", `%${search}%`);
    }

    const { data: questions, error } = await query;

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.json({
      success: true,
      questions: questions || [],
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Get summary statistics for the teacher's Question Bank.
 */
export async function getQuestionBankStats(req, res) {
  const teacherId = req.profile?.id || "default_teacher";

  try {
    let questions = [];

    if (!isSupabaseConfigured) {
      questions = localStore.get("questions");
    } else {
      const { data, error } = await supabaseAdmin
        .from("questions")
        .select("status, difficulty")
        .eq("teacher_id", teacherId);

      if (error) {
        return res.status(500).json({ success: false, message: error.message });
      }
      questions = data || [];
    }

    const stats = {
      total: questions.length,
      approved: questions.filter((q) => q.status === "approved").length,
      pending: questions.filter((q) => q.status === "pending").length,
      rejected: questions.filter((q) => q.status === "rejected").length,
      easy: questions.filter((q) => q.difficulty === "Easy" && q.status === "approved").length,
      medium: questions.filter((q) => q.difficulty === "Medium" && q.status === "approved").length,
      hard: questions.filter((q) => q.difficulty === "Hard" && q.status === "approved").length,
    };

    return res.json({ success: true, stats });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Edit an existing question.
 */
export async function updateQuestion(req, res) {
  const { id } = req.params;
  const teacherId = req.profile?.id || "default_teacher";
  const { question_text, options, correct_answer, difficulty, explanation, status } = req.body;

  try {
    const updateFields = {
      updated_at: new Date().toISOString(),
    };

    if (question_text) updateFields.question_text = question_text.trim();
    if (options && Array.isArray(options)) updateFields.options = options;
    if (correct_answer) updateFields.correct_answer = correct_answer.trim();
    if (difficulty) updateFields.difficulty = difficulty;
    if (explanation) updateFields.explanation = explanation.trim();
    if (status) updateFields.status = status;

    if (!isSupabaseConfigured) {
      const updated = localStore.update("questions", id, updateFields);
      return res.json({ success: true, message: "Question updated successfully.", question: updated });
    }

    const { data: updated, error } = await supabaseAdmin
      .from("questions")
      .update(updateFields)
      .eq("id", id)
      .eq("teacher_id", teacherId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.json({
      success: true,
      message: "Question updated successfully.",
      question: updated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Quick status change (Approve or Reject).
 */
export async function updateQuestionStatus(req, res) {
  const { id } = req.params;
  const teacherId = req.profile?.id || "default_teacher";
  const { status } = req.body;

  if (!["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be 'approved', 'rejected', or 'pending'." });
  }

  try {
    if (!isSupabaseConfigured) {
      const updated = localStore.update("questions", id, { status });
      return res.json({ success: true, message: `Question marked as ${status}.`, question: updated });
    }

    const { data: updated, error } = await supabaseAdmin
      .from("questions")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("teacher_id", teacherId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.json({
      success: true,
      message: `Question marked as ${status}.`,
      question: updated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Delete a question.
 */
export async function deleteQuestion(req, res) {
  const { id } = req.params;
  const teacherId = req.profile?.id || "default_teacher";

  try {
    if (!isSupabaseConfigured) {
      localStore.delete("questions", id);
      return res.json({ success: true, message: "Question deleted successfully." });
    }

    const { error } = await supabaseAdmin
      .from("questions")
      .delete()
      .eq("id", id)
      .eq("teacher_id", teacherId);

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.json({ success: true, message: "Question deleted successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
