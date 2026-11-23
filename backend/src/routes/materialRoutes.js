import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireTeacher } from "../middleware/authMiddleware.js";
import { uploadMaterial, getMaterials, deleteMaterial } from "../controllers/materialController.js";

const router = express.Router();

// Ensure local uploads/temp directory exists
const uploadDir = path.resolve("./uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files (.pdf) are allowed."), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max limit
  fileFilter,
});

// Teacher routes
router.post("/upload", requireTeacher, upload.single("pdf"), uploadMaterial);
router.get("/", requireTeacher, getMaterials);
router.delete("/:id", requireTeacher, deleteMaterial);

export default router;
