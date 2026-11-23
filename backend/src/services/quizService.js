/**
 * Fisher-Yates array shuffle.
 */
export function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Randomly selects questions from an approved pool strictly adhering
 * to the quiz's difficulty distribution (Easy, Medium, Hard).
 *
 * @param {object} quiz - { easy_count, medium_count, hard_count, total_questions }
 * @param {Array} approvedQuestions - Full list of approved questions available for this quiz
 * @returns {Array<string>} Array of question IDs in randomized sequence
 */
export function selectRandomQuestionsWithDistribution(quiz, approvedQuestions) {
  const easyPool = approvedQuestions.filter((q) => q.difficulty === "Easy");
  const mediumPool = approvedQuestions.filter((q) => q.difficulty === "Medium");
  const hardPool = approvedQuestions.filter((q) => q.difficulty === "Hard");

  const targetEasy = parseInt(quiz.easy_count, 10) || 0;
  const targetMedium = parseInt(quiz.medium_count, 10) || 0;
  const targetHard = parseInt(quiz.hard_count, 10) || 0;
  const targetTotal = parseInt(quiz.total_questions, 10) || targetEasy + targetMedium + targetHard;

  // Shuffle pools before sampling
  const shuffledEasy = shuffleArray(easyPool);
  const shuffledMedium = shuffleArray(mediumPool);
  const shuffledHard = shuffleArray(hardPool);

  const selectedQuestions = [];

  // 1. Pick exact required counts from each tier
  selectedQuestions.push(...shuffledEasy.slice(0, targetEasy));
  selectedQuestions.push(...shuffledMedium.slice(0, targetMedium));
  selectedQuestions.push(...shuffledHard.slice(0, targetHard));

  // 2. If pool fell short on any specific tier, fill remaining from available leftovers
  if (selectedQuestions.length < targetTotal) {
    const selectedIds = new Set(selectedQuestions.map((q) => q.id));
    const leftovers = shuffleArray(approvedQuestions.filter((q) => !selectedIds.has(q.id)));
    const needed = targetTotal - selectedQuestions.length;
    selectedQuestions.push(...leftovers.slice(0, needed));
  }

  // 3. Shuffle the combined test sequence so questions aren't strictly grouped by tier
  const finalSequence = shuffleArray(selectedQuestions);

  return finalSequence.map((q) => q.id);
}

/**
 * Strips sensitive answer keys and explanations from questions before sending to student.
 * @param {Array} questions
 * @returns {Array} Sanitized questions
 */
export function sanitizeQuestionsForStudent(questions) {
  return questions.map((q) => ({
    id: q.id,
    question_text: q.question_text,
    options: shuffleArray(q.options), // Shuffle options per attempt for exam integrity
    difficulty: q.difficulty,
  }));
}

/**
 * Backend evaluation of student answers against the question key.
 *
 * @param {Array} originalQuestions - Questions with correct_answer and explanation
 * @param {object} submittedAnswers - Map of { [questionId]: selectedOptionString }
 * @returns {object} { score, total, percentage, answersRecord, review }
 */
export function evaluateAttempt(originalQuestions, submittedAnswers = {}) {
  let score = 0;
  const answersRecord = [];
  const review = [];

  const questionsMap = new Map();
  originalQuestions.forEach((q) => questionsMap.set(q.id, q));

  for (const q of originalQuestions) {
    const studentChoice = submittedAnswers[q.id] || null;
    const isCorrect = Boolean(studentChoice && studentChoice.trim() === q.correct_answer.trim());

    if (isCorrect) {
      score += 1;
    }

    answersRecord.push({
      question_id: q.id,
      selected_option: studentChoice,
      is_correct: isCorrect,
    });

    review.push({
      id: q.id,
      question_text: q.question_text,
      options: q.options,
      selected_option: studentChoice,
      correct_answer: q.correct_answer,
      is_correct: isCorrect,
      difficulty: q.difficulty,
      explanation: q.explanation,
    });
  }

  const total = originalQuestions.length;
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

  return {
    score,
    total,
    percentage,
    answersRecord,
    review,
  };
}
