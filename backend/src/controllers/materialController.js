import fs from "fs";
import path from "path";
import { supabaseAdmin, isSupabaseConfigured } from "../config/supabase.js";
import { generateMCQsFromPDF } from "../services/geminiService.js";
import { localStore } from "../services/localStore.js";

/**
 * Controller: Handles PDF upload, storage in Supabase (or local store), and optional AI question generation.
 */
export async function uploadMaterial(req, res) {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, message: "No PDF file provided." });
  }

  const title = (req.body.title || file.originalname.replace(/\.[^/.]+$/, "")).trim();
  const generateQuestions = req.body.generateQuestions === "true" || req.body.generateQuestions === true;
  const questionCount = parseInt(req.body.questionCount, 10) || 5;
  const teacherId = req.profile?.id || "default_teacher";

  try {
    let storagePath = `materials/${Date.now()}_${file.originalname}`;
    let fileUrl = "";

    // 1. Upload to Supabase Storage if configured
    if (isSupabaseConfigured) {
      const fileBuffer = fs.readFileSync(file.path);
      const { data: uploadData, error: storageError } = await supabaseAdmin.storage
        .from("study-materials")
        .upload(storagePath, fileBuffer, {
          contentType: file.mimetype || "application/pdf",
          upsert: true,
        });

      if (storageError) {
        console.warn("Storage upload notice:", storageError.message);
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from("study-materials")
        .getPublicUrl(storagePath);
      fileUrl = publicUrlData?.publicUrl || "";
    } else {
      fileUrl = `/uploads/${file.filename}`;
    }

    // 2. Insert record into study_materials table
    let materialId = null;
    if (isSupabaseConfigured) {
      const { data: material, error: dbError } = await supabaseAdmin
        .from("study_materials")
        .insert({
          teacher_id: teacherId,
          title,
          file_name: file.originalname,
          file_url: fileUrl,
          storage_path: storagePath,
          file_size: file.size,
        })
        .select()
        .single();

      if (dbError) {
        console.error("DB Insert Error:", dbError);
        return res.status(500).json({ success: false, message: "Failed to record study material in database." });
      }
      materialId = material.id;
    } else {
      const localMat = localStore.insert("materials", {
        teacher_id: teacherId,
        title,
        file_name: file.originalname,
        file_url: fileUrl,
        storage_path: storagePath,
        file_size: file.size,
        local_file_path: file.path,
      });
      materialId = localMat.id;
    }

    // 3. Optional immediate AI question generation via Gemini
    let generatedQuestions = [];
    if (generateQuestions) {
      try {
        console.log(`[Upload] Automatically generating ${questionCount} MCQs from uploaded PDF...`);
        const aiQuestions = await generateMCQsFromPDF(file.path, { count: questionCount });

        if (isSupabaseConfigured && materialId) {
          const rowsToInsert = aiQuestions.map((q) => ({
            material_id: materialId,
            teacher_id: teacherId,
            question_text: q.question,
            options: q.options,
            correct_answer: q.correctAnswer,
            difficulty: q.difficulty,
            explanation: q.explanation,
            status: "pending",
          }));

          const { data: insertedQuestions, error: qError } = await supabaseAdmin
            .from("questions")
            .insert(rowsToInsert)
            .select();

          if (qError) {
            console.error("Failed to insert generated questions:", qError);
          } else {
            generatedQuestions = insertedQuestions;
          }
        } else {
          const rowsToInsert = aiQuestions.map((q) => ({
            material_id: materialId,
            teacher_id: teacherId,
            question_text: q.question,
            options: q.options,
            correct_answer: q.correctAnswer,
            difficulty: q.difficulty,
            explanation: q.explanation,
            status: "pending",
          }));
          generatedQuestions = localStore.insertMany("questions", rowsToInsert);
        }
      } catch (aiError) {
        console.error("AI Generation Warning during upload:", aiError.message);
      }
    }

    // Keep file if local mode so we can re-analyze, or remove if in Supabase
    if (isSupabaseConfigured) {
      try {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch (e) {}
    }

    return res.status(201).json({
      success: true,
      message: "Study material uploaded successfully.",
      material: {
        id: materialId,
        title,
        fileName: file.originalname,
        fileUrl,
      },
      generatedQuestionsCount: generatedQuestions.length,
      questions: generatedQuestions,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process PDF upload.",
    });
  }
}

/**
 * Controller: Get all study materials for the logged-in teacher.
 */
export async function getMaterials(req, res) {
  try {
    const teacherId = req.profile?.id || "default_teacher";

    if (!isSupabaseConfigured) {
      const allMats = localStore.get("materials");
      const allQs = localStore.get("questions");
      const enriched = allMats.map((m) => ({
        ...m,
        questionCount: allQs.filter((q) => q.material_id === m.id).length,
      }));
      return res.json({ success: true, materials: enriched });
    }

    const { data: materials, error } = await supabaseAdmin
      .from("study_materials")
      .select("*, questions:questions!fk_questions_material(count)")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.json({
      success: true,
      materials: materials.map((m) => ({
        ...m,
        questionCount: m.questions?.[0]?.count || 0,
      })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Delete study material and associated storage.
 */
export async function deleteMaterial(req, res) {
  const { id } = req.params;
  const teacherId = req.profile?.id || "default_teacher";

  try {
    if (!isSupabaseConfigured) {
      const mat = localStore.findById("materials", id);
      if (mat?.local_file_path && fs.existsSync(mat.local_file_path)) {
        try { fs.unlinkSync(mat.local_file_path); } catch (e) {}
      }
      localStore.delete("materials", id);
      return res.json({ success: true, message: "Study material deleted." });
    }

    const { data: material } = await supabaseAdmin
      .from("study_materials")
      .select("*")
      .eq("id", id)
      .eq("teacher_id", teacherId)
      .single();

    if (!material) {
      return res.status(404).json({ success: false, message: "Material not found or access denied." });
    }

    // Delete from Supabase Storage
    if (material.storage_path) {
      await supabaseAdmin.storage.from("study-materials").remove([material.storage_path]);
    }

    // Delete from DB (foreign key cascades or sets null on questions)
    await supabaseAdmin.from("study_materials").delete().eq("id", id);

    return res.json({ success: true, message: "Study material deleted successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
