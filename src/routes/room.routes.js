import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
    getAllRooms,
    createRoom,
    joinRoom,
    updateRoom,
    deleteRoom,
} from "../controllers/room.controller.js";

const router = express.Router();
router.use(protectRoute);

router.get("/", getAllRooms);
router.post("/", createRoom);
router.post("/:roomId/join", joinRoom);
router.patch("/:roomId", updateRoom);
router.delete("/:roomId", deleteRoom);

export default router;