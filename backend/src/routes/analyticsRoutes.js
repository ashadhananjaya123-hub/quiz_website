import express from "express";
import { requireTeacher, requireStudent } from "../middleware/authMiddleware.js";
import {
  getTeacherAnalytics,
  getQuizAnalytics,
  getStudentAnalytics,
} from "../controllers/analyticsController.js";

const router = express.Router();

router.get("/teacher", requireTeacher, getTeacherAnalytics);
router.get("/teacher/quiz/:quizId", requireTeacher, getQuizAnalytics);
router.get("/student", requireStudent, getStudentAnalytics);

export default router;
