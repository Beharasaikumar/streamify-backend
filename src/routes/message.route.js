import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getDMHistory,
  getRoomHistory,
  getUnreadCounts,
  deleteMessage,
  markAsRead,
} from "../controllers/message.controller.js";

const router = express.Router();

router.use(protectRoute);

// DM history
router.get("/dm/:userId", getDMHistory);

// Room history
router.get("/room/:roomId", getRoomHistory);

// Get unread counts
router.get("/unread/counts", getUnreadCounts);

// Mark message as read
router.patch("/:messageId/read", markAsRead);

// Delete message (soft delete)
router.delete("/:messageId", deleteMessage);

export default router;