import "dotenv/config";
import {
  GoogleGenAI,
  createPartFromUri,
  createUserContent,
  Type,
} from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || "gemini-3.8-flash";

if (!apiKey) {
  console.error("Error: GEMINI_API_KEY is not defined in .env file.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

/**
 * Validates the structure and content of generated MCQs.
 * @param {Array} questions
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateMCQs(questions) {
  const errors = [];

  if (!Array.isArray(questions) || questions.length === 0) {
    return { valid: false, errors: ["Output is not a non-empty array of questions."] };
  }

  questions.forEach((q, idx) => {
    const qNum = idx + 1;

    if (!q.question || typeof q.question !== "string" || q.question.trim().length === 0) {
      errors.push(`Question #${qNum}: Missing or invalid question text.`);
    }

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      errors.push(`Question #${qNum}: Must have exactly 4 options.`);
    } else {
      const distinctOptions = new Set(q.options.map((opt) => String(opt).trim()));
      if (distinctOptions.size !== 4) {
        errors.push(`Question #${qNum}: Options must be 4 unique choices.`);
      }
      if (q.options.some((opt) => typeof opt !== "string" || opt.trim().length === 0)) {
        errors.push(`Question #${qNum}: All 4 options must be non-empty strings.`);
      }
    }

    if (!q.correctAnswer || typeof q.correctAnswer !== "string") {
      errors.push(`Question #${qNum}: Missing or invalid correctAnswer.`);
    } else if (Array.isArray(q.options) && !q.options.includes(q.correctAnswer)) {
      // Check if it trimmed matches
      const match = q.options.find((opt) => opt.trim() === q.correctAnswer.trim());
      if (!match) {
        errors.push(`Question #${qNum}: correctAnswer "${q.correctAnswer}" does not match any of the 4 options.`);
      }
    }

    const validDifficulties = ["Easy", "Medium", "Hard"];
    if (!validDifficulties.includes(q.difficulty)) {
      errors.push(`Question #${qNum}: Difficulty must be 'Easy', 'Medium', or 'Hard' (got '${q.difficulty}').`);
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
 * Generates MCQs from a PDF file using Gemini.
 * @param {string} filePath
 * @param {number} count
 */
async function generateMCQsFromPDF(filePath, count = 5) {
  try {
    console.log(`\n========================================`);
    console.log(`1. Uploading PDF (${filePath}) via Gemini Files API...`);
    console.log(`========================================`);

    const pdf = await ai.files.upload({
      file: filePath,
      config: {
        mimeType: "application/pdf",
      },
    });

    console.log(`✓ PDF uploaded successfully! URI: ${pdf.uri}`);

    console.log(`\n========================================`);
    console.log(`2. Requesting ${count} structured MCQs from Gemini model: ${modelName}...`);
    console.log(`========================================`);

    const prompt = `You are an expert academic examiner. Read the attached study material thoroughly.
Generate ${count} high-quality, academic Multiple-Choice Questions (MCQs) based STRICTLY on the contents of the attached PDF.

Guidelines:
1. Provide an even mix of difficulty levels: 'Easy' (direct recall/definitions), 'Medium' (conceptual understanding/application), and 'Hard' (analytical/synthesis).
2. For each question, provide exactly four plausible options (one correct answer and three convincing distractors).
3. The 'correctAnswer' must be the EXACT text of one of the 4 options.
4. Provide a clear, educational explanation citing how the material supports the correct answer.
5. Do NOT reference hypothetical or external information not present in the document.
6. Do NOT duplicate questions.`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: createUserContent([
        createPartFromUri(pdf.uri, pdf.mimeType),
        prompt,
      ]),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          description: "List of multiple-choice questions generated from the document",
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
                description: "List of exactly 4 distinct answer choices",
              },
              correctAnswer: {
                type: Type.STRING,
                description: "The exact string of the correct answer, which must be present in the options list",
              },
              difficulty: {
                type: Type.STRING,
                enum: ["Easy", "Medium", "Hard"],
                description: "Difficulty tier: Easy, Medium, or Hard",
              },
              explanation: {
                type: Type.STRING,
                description: "Explanation of why the answer is correct according to the document",
              },
            },
            required: ["question", "options", "correctAnswer", "difficulty", "explanation"],
          },
        },
      },
    });

    console.log(`✓ Received response from Gemini! Parsing and validating JSON...`);

    const rawText = response.text;
    let questions;

    try {
      questions = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("Failed to parse JSON response:", parseErr.message);
      console.log("Raw Response was:\n", rawText);
      return;
    }

    const validation = validateMCQs(questions);

    if (!validation.valid) {
      console.error("\n❌ Validation Failed with the following errors:");
      validation.errors.forEach((err) => console.error(`  - ${err}`));
      return;
    }

    console.log(`\n✅ Structured MCQ Generation Successful! (${questions.length} questions validated)`);

    // Distribution metrics
    const counts = { Easy: 0, Medium: 0, Hard: 0 };
    questions.forEach((q) => {
      counts[q.difficulty] = (counts[q.difficulty] || 0) + 1;
    });
    console.log(`\nDifficulty Distribution: Easy: ${counts.Easy}, Medium: ${counts.Medium}, Hard: ${counts.Hard}`);

    console.log(`\n========================================`);
    console.log(`Generated Questions Sample:`);
    console.log(`========================================`);

    questions.forEach((q, idx) => {
      console.log(`\nQ${idx + 1} [${q.difficulty}]: ${q.question}`);
      q.options.forEach((opt, oIdx) => {
        const marker = opt === q.correctAnswer ? "✓" : " ";
        const letter = String.fromCharCode(65 + oIdx);
        console.log(`   [${letter}] ${marker} ${opt}`);
      });
      console.log(`   Explanation: ${q.explanation}`);
    });

    return questions;
  } catch (error) {
    console.error("\n❌ Error generating MCQs:", error.message);
    if (error.status) {
      console.error(`Status code: ${error.status}`);
    }
  }
}

// Run test on sample.pdf
generateMCQsFromPDF("./sample.pdf", 5);
