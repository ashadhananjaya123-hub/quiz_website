import express from "express";
import { register, login, quickAccess } from "../controllers/authController.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/quick-access", quickAccess);

export default router;
