import express from "express";
import http    from "http";
import { Server } from "socket.io";
import "dotenv/config";
import Message from "../models/Message.js";
import User    from "../models/User.js";

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true },
  transports: ["websocket", "polling"],
});

// userId (string) → Set of socket IDs
const activeUsers  = new Map();
// roomId → Set<userId string>
const activeRooms  = new Map();
// callId → { initiator, recipient, status }
const callSessions = new Map();

// ── Auth middleware ───────────────────────────────────────
io.use((socket, next) => {
  const userId = socket.handshake.auth.userId;
  if (!userId) return next(new Error("User ID required"));
  socket.userId = String(userId);
  next();
});

// ── Connection ────────────────────────────────────────────
io.on("connection", (socket) => {
  const uid = socket.userId;
  console.log(`[Socket] ${uid} connected: ${socket.id}`);

  socket.join(`user:${uid}`);

  if (!activeUsers.has(uid)) {
    activeUsers.set(uid, new Set());
  }
  const userSockets = activeUsers.get(uid);
  const wasOffline = userSockets.size === 0;
  userSockets.add(socket.id);

  // ① Tell THIS user who is currently online
  socket.emit("users:online", Array.from(activeUsers.keys()));

  // ② Tell EVERYONE ELSE this user just came online (only if first connection)
  if (wasOffline) {
    socket.broadcast.emit("user:online", { userId: uid });
  }

  // ── DM ────────────────────────────────────────────────
  socket.on("dm:join", ({ recipientId }) => {
    const channelId = [uid, String(recipientId)].sort().join("-");
    socket.join(channelId);
    console.log(`[DM] ${uid} joined channel with ${recipientId}`);
  });

  socket.on("dm:message", async ({ recipientId, text }) => {
    const rid       = String(recipientId);
    const channelId = [uid, rid].sort().join("-");
    try {
      const message = await Message.create({ sender: uid, recipient: rid, text });
      await message.populate("sender", "fullName profilePic");

      const payload = {
        _id:      message._id,
        sender:   { _id: uid, fullName: message.sender.fullName, profilePic: message.sender.profilePic },
        receiver: { _id: rid },
        text:     message.text,
        timestamp: message.createdAt,
      };

      io.to(channelId).emit("dm:message:new", payload);

      const recipientSockets = activeUsers.get(rid);
      if (recipientSockets && recipientSockets.size > 0) {
        await Message.updateOne({ _id: message._id }, { isRead: true, readAt: new Date() });
        io.to(channelId).emit("dm:message:read", { messageId: message._id });
      }
    } catch (err) {
      console.error("[DM Message Error]", err);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  socket.on("dm:typing", ({ recipientId, isTyping }) => {
    const channelId = [uid, String(recipientId)].sort().join("-");
    io.to(channelId).emit("dm:user:typing", { userId: uid, isTyping });
  });

  socket.on("dm:history", async ({ recipientId, limit = 50, offset = 0 }) => {
    const rid = String(recipientId);
    try {
      const messages = await Message.find({
        $or: [
          { sender: uid, recipient: rid },
          { sender: rid, recipient: uid },
        ],
        deletedBy: { $nin: [uid] },
      })
        .populate("sender", "fullName profilePic")
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit);

      socket.emit("dm:history:loaded", {
        messages: messages.reverse(),
        hasMore:  messages.length === limit,
      });

      const channelId = [uid, rid].sort().join("-");
      await Message.updateMany(
        { recipient: uid, sender: rid, isRead: false },
        { isRead: true, readAt: new Date() }
      );
      io.to(channelId).emit("dm:messages:allRead");
    } catch (err) {
      console.error("[DM History Error]", err);
      socket.emit("error", { message: "Failed to load history" });
    }
  });

  // ── Rooms ─────────────────────────────────────────────
  socket.on("room:join", ({ roomId }) => {
    socket.join(roomId);
    if (!activeRooms.has(roomId)) activeRooms.set(roomId, new Set());
    activeRooms.get(roomId).add(uid);
    io.to(roomId).emit("room:user:joined", {
      userId:      uid,
      memberCount: activeRooms.get(roomId).size,
    });
  });

  socket.on("room:message", async ({ roomId, text }) => {
    try {
      const message = await Message.create({ sender: uid, room: roomId, text });
      await message.populate("sender", "fullName profilePic");
      io.to(roomId).emit("room:message:new", {
        _id:       message._id,
        room:      roomId,
        sender:    message.sender,
        text:      message.text,
        timestamp: message.createdAt,
      });
    } catch (err) {
      console.error("[Room Message Error]", err);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  socket.on("room:typing", ({ roomId, isTyping }) =>
    io.to(roomId).emit("room:user:typing", { roomId, userId: uid, isTyping })
  );

  socket.on("room:history", async ({ roomId, limit = 50, offset = 0 }) => {
    try {
      const messages = await Message.find({
        room:      roomId,
        deletedBy: { $nin: [uid] },
      })
        .populate("sender", "fullName profilePic")
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit);

      socket.emit("room:history:loaded", {
        messages: messages.reverse(),
        hasMore:  messages.length === limit,
      });
    } catch (err) {
      console.error("[Room History Error]", err);
      socket.emit("error", { message: "Failed to load history" });
    }
  });

  socket.on("room:leave", ({ roomId }) => {
    socket.leave(roomId);
    const members = activeRooms.get(roomId);
    if (members) {
      members.delete(uid);
      if (members.size === 0) activeRooms.delete(roomId);
      else io.to(roomId).emit("room:user:left", { userId: uid, memberCount: members.size });
    }
  });

  // ── Video Call Signaling ───────────────────────────────

  socket.on("call:initiate", async ({ recipientId, callId, initiatorName }) => {
    const rid             = String(recipientId);
    const recipientSockets = activeUsers.get(rid);
    const isOnline        = recipientSockets && recipientSockets.size > 0;

    if (!isOnline) {
      socket.emit("call:error", { message: "Recipient is offline" });
      return;
    }

    // Fallback: look up name from DB if not provided
    let callerName = initiatorName;
    if (!callerName) {
      try {
        const user = await User.findById(uid).select("fullName").lean();
        callerName = user?.fullName || "Someone";
      } catch {
        callerName = "Someone";
      }
    }

    callSessions.set(callId, { initiator: uid, recipient: rid, status: "ringing" });
    console.log(`[Call] ${uid} → ${rid} callId=${callId}`);

    io.to(`user:${rid}`).emit("call:incoming", {
      callId,
      initiatorId:   uid,
      initiatorName: callerName,
    });
  });

  socket.on("call:accept", ({ callId, recipientId }) => {
    const session = callSessions.get(callId);
    if (!session) return;
    session.status = "active";
    console.log(`[Call] Accepted callId=${callId}, notifying initiator ${session.initiator}`);
    io.to(`user:${session.initiator}`).emit("call:accepted", { callId });
  });

  /**
   * call:recipient:ready
   * Recipient emits this after their RTCPeerConnection is fully set up
   * and they have added their local tracks. Only then does the initiator
   * send the WebRTC offer — this prevents the race condition where the
   * offer arrives before the recipient's PC exists.
   */
  socket.on("call:recipient:ready", ({ callId, initiatorId }) => {
    console.log(`[Call] Recipient ready for callId=${callId}, notifying initiator ${initiatorId}`);
    io.to(`user:${initiatorId}`).emit("call:recipient:ready", { callId });
  });

  socket.on("call:reject", ({ callId }) => {
    const session = callSessions.get(callId);
    if (session) {
      io.to(`user:${session.initiator}`).emit("call:rejected", { callId });
    }
    callSessions.delete(callId);
  });

  socket.on("call:offer", ({ callId, offer, recipientId }) => {
    io.to(`user:${recipientId}`).emit("call:offer:received", {
      callId, offer, senderId: uid,
    });
  });

  socket.on("call:answer", ({ callId, answer, recipientId }) => {
    io.to(`user:${recipientId}`).emit("call:answer:received", {
      callId, answer, senderId: uid,
    });
  });

  socket.on("call:ice-candidate", ({ callId, candidate, recipientId }) => {
    io.to(`user:${recipientId}`).emit("call:ice-candidate:received", {
      callId, candidate, senderId: uid,
    });
  });

  socket.on("call:end", ({ callId, recipientId }) => {
    io.to(`user:${recipientId}`).emit("call:ended", { callId });
    callSessions.delete(callId);
    console.log(`[Call] Ended callId=${callId}`);
  });

  // ── Disconnect ────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log(`[Socket] ${uid} disconnected: ${socket.id}`);
    const userSockets = activeUsers.get(uid);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        activeUsers.delete(uid);
        io.emit("user:offline", { userId: uid });
      }
    }
    activeRooms.forEach((members) => members.delete(uid));
  });

  socket.on("error", (err) => console.error(`[Socket Error] ${uid}:`, err));
});

export { io, server, app };