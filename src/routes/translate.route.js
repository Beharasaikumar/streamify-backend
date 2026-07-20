import express from "express";
import multer from "multer";
import { protectRoute } from "../middleware/auth.middleware.js";
import { translateText, transcribeAudio } from "../controllers/translate.controller.js";

const router    = express.Router();
const upload    = multer({ storage: multer.memoryStorage() });

router.use(protectRoute);
router.post("/translate",  translateText);
router.post("/transcribe", upload.single("audio"), transcribeAudio);

export default router;