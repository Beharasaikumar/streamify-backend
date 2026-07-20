import express from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";

import { io, server, app } from "./lib/socket.js";
import { connectDB } from "./lib/db.js";

import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import chatRoutes from "./routes/chat.route.js";
import roomRoutes from "./routes/room.routes.js";
import translateRoutes from "./routes/translate.route.js";
import challengeRoutes from "./routes/challenge.route.js";
import messageRoutes from "./routes/message.route.js"; // NEW

const PORT = process.env.PORT || 5001;
const __dirname = path.resolve();

// Middleware
app.use(
  cors({
    origin: "https://streamify-frontend-5zxr-smoky.vercel.app/",
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/ai", translateRoutes);
app.use("/api/challenges", challengeRoutes);
app.use("/api/messages", messageRoutes); // NEW

// Production build
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

// Start server with Socket.io
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.io listening on port ${PORT}`);
  connectDB();
});

export { io };
