import express from "express";
import { requireTeacher } from "../middleware/authMiddleware.js";
import {
  generateQuestions,
  getQuestions,
  getQuestionBankStats,
  updateQuestion,
  updateQuestionStatus,
  deleteQuestion,
} from "../controllers/questionController.js";

const router = express.Router();

router.post("/generate", requireTeacher, generateQuestions);
router.get("/stats", requireTeacher, getQuestionBankStats);
router.get("/", requireTeacher, getQuestions);
router.put("/:id", requireTeacher, updateQuestion);
router.patch("/:id/status", requireTeacher, updateQuestionStatus);
router.delete("/:id", requireTeacher, deleteQuestion);

export default router;
