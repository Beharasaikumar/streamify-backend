import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getTodaysChallenges,
  submitAnswer,
  refreshChallenges,
} from "../controllers/challenge.controller.js";

const router = express.Router();
router.use(protectRoute);

router.get("/today",    getTodaysChallenges);
router.post("/submit",  submitAnswer);
router.post("/refresh", refreshChallenges);

export default router;