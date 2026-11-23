import { ai, geminiModel, createPartFromUri, createUserContent, Type } from "../config/gemini.js";

/**
 * Validates the generated MCQ array structure and constraints.
 * @param {Array} questions
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMCQs(questions) {
  const errors = [];

  if (!Array.isArray(questions) || questions.length === 0) {
    return { valid: false, errors: ["AI did not return any questions."] };
  }

  questions.forEach((q, idx) => {
    const qNum = idx + 1;

    if (!q.question || typeof q.question !== "string" || q.question.trim().length === 0) {
      errors.push(`Question #${qNum}: Missing or invalid question text.`);
    }

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      errors.push(`Question #${qNum}: Must have exactly 4 choices.`);
    } else {
      const distinct = new Set(q.options.map((opt) => String(opt).trim()));
      if (distinct.size !== 4) {
        errors.push(`Question #${qNum}: Options must be 4 unique answers.`);
      }
      if (q.options.some((opt) => typeof opt !== "string" || opt.trim().length === 0)) {
        errors.push(`Question #${qNum}: All choices must be non-empty text.`);
      }
    }

    if (!q.correctAnswer || typeof q.correctAnswer !== "string") {
      errors.push(`Question #${qNum}: Missing correctAnswer.`);
    } else if (Array.isArray(q.options)) {
      const match = q.options.find((opt) => opt.trim() === q.correctAnswer.trim());
      if (!match) {
        errors.push(`Question #${qNum}: correctAnswer does not match any of the 4 options.`);
      } else {
        // Normalize exact match to option string
        q.correctAnswer = match;
      }
    }

    const validDifficulties = ["Easy", "Medium", "Hard"];
    if (!validDifficulties.includes(q.difficulty)) {
      errors.push(`Question #${qNum}: Invalid difficulty '${q.difficulty}'. Must be Easy, Medium, or Hard.`);
    }

    if (!q.explanation || typeof q.explanation !== "string" || q.explanation.trim().length === 0) {
      errors.push(`Question #${qNum}: Missing or invalid explanation.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates MCQs from a local PDF file using the official Gemini SDK.
 * @param {string} filePath - Local absolute or relative path to PDF
 * @param {object} options - Options: { count: number, customInstructions: string }
 * @returns {Promise<Array>} Array of validated question objects
 */
export async function generateMCQsFromPDF(filePath, options = {}) {
  const count = parseInt(options.count, 10) || 5;
  const customInstructions = options.customInstructions || "";

  let uploadedFile = null;

  try {
    console.log(`[GeminiService] Uploading PDF to Gemini Files API: ${filePath}`);
    uploadedFile = await ai.files.upload({
      file: filePath,
      config: {
        mimeType: "application/pdf",
      },
    });

    console.log(`[GeminiService] Uploaded successfully with URI: ${uploadedFile.uri}`);

    const prompt = `You are an expert academic examiner and professor.
Analyze the attached document carefully and generate exactly ${count} academic Multiple-Choice Questions (MCQs) based STRICTLY on the contents of the attached PDF.

Guidelines:
1. Provide an even, balanced mix of difficulty levels: 'Easy' (factual definitions and direct recall), 'Medium' (conceptual understanding and application), and 'Hard' (analytical synthesis and edge cases).
2. For each question, provide exactly four distinct options (one unambiguously correct answer and three plausible distractors).
3. The 'correctAnswer' MUST match the EXACT string of one of the 4 options.
4. Provide a thorough, educational 'explanation' citing specific concepts or sections in the document.
5. Avoid trick questions or referencing facts outside of this PDF.
6. Do NOT duplicate questions.
${customInstructions ? `Special teacher instructions: ${customInstructions}` : ""}`;

    console.log(`[GeminiService] Calling Gemini model (${geminiModel}) for ${count} structured questions...`);

    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
        prompt,
      ]),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          description: "List of multiple-choice questions extracted from the document",
          items: {
            type: Type.OBJECT,
            properties: {
              question: {
                type: Type.STRING,
                description: "The question text",
              },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Exactly 4 distinct choices",
              },
              correctAnswer: {
                type: Type.STRING,
                description: "The exact matching text of the correct choice from options",
              },
              difficulty: {
                type: Type.STRING,
                enum: ["Easy", "Medium", "Hard"],
                description: "Difficulty tier",
              },
              explanation: {
                type: Type.STRING,
                description: "Why this answer is correct based on the text",
              },
            },
            required: ["question", "options", "correctAnswer", "difficulty", "explanation"],
          },
        },
      },
    });

    const rawText = response.text;
    const questions = JSON.parse(rawText);

    const validation = validateMCQs(questions);
    if (!validation.valid) {
      throw new Error(`Generated questions failed validation: ${validation.errors.join("; ")}`);
    }

    console.log(`[GeminiService] Successfully generated and validated ${questions.length} questions.`);
    return questions;
  } finally {
    // Clean up Gemini Files API temporary file
    if (uploadedFile && uploadedFile.name) {
      try {
        console.log(`[GeminiService] Cleaning up temporary Gemini file: ${uploadedFile.name}`);
        await ai.files.delete({ name: uploadedFile.name });
      } catch (cleanupErr) {
        console.warn(`[GeminiService] Notice: could not delete temporary Gemini file (${cleanupErr.message})`);
      }
    }
  }
}
