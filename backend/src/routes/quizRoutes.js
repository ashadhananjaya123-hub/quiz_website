import express from "express";
import { requireTeacher, requireStudent, requireAuth } from "../middleware/authMiddleware.js";
import {
  createQuiz,
  getTeacherQuizzes,
  getStudentQuizzes,
  updateQuiz,
  deleteQuiz,
  startQuizAttempt,
  submitQuizAttempt,
  getAttemptResult,
} from "../controllers/quizController.js";

const router = express.Router();

// Teacher routes
router.post("/", requireTeacher, createQuiz);
router.get("/teacher", requireTeacher, getTeacherQuizzes);
router.put("/:id", requireTeacher, updateQuiz);
router.delete("/:id", requireTeacher, deleteQuiz);

// Student routes
router.get("/student", requireStudent, getStudentQuizzes);
router.post("/start", requireStudent, startQuizAttempt);
router.post("/submit", requireStudent, submitQuizAttempt);
router.get("/result/:attemptId", requireAuth, getAttemptResult);

export default router;
