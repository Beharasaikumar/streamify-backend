import Room from "../models/Room.js";
import Message from "../models/Message.js";

// Helper: enrich rooms with last message and member count from MongoDB
async function enrichRooms(rooms, currentUserId) {
  if (!rooms.length) return [];

  const roomIds = rooms.map((r) => r.roomId);

  // Last message per room
  const lastMessages = await Message.aggregate([
    { $match: { room: { $in: roomIds } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$room", lastMessage: { $first: "$text" }, lastAt: { $first: "$createdAt" } } },
  ]);

  const lastMsgMap = Object.fromEntries(
    lastMessages.map((l) => [l._id, { text: l.lastMessage, at: l.lastAt }])
  );

  return rooms.map((room) => {
    const members = room.members || [];
    const isJoined = members.some((id) => id.toString() === currentUserId.toString());
    const lastMsgData = lastMsgMap[room.roomId];

    return {
      id: room.roomId,
      name: room.name,
      topic: room.topic,
      emoji: room.emoji,
      createdBy: room.createdBy,
      memberCount: members.length,
      isJoined,
      lastMessage: lastMsgData ? lastMsgData.text : null,
      lastMessageAt: lastMsgData ? lastMsgData.at : null,
    };
  });
}

// GET /api/rooms
export async function getAllRooms(req, res) {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 });
    const currentUserId = req.user._id;
    const result = await enrichRooms(rooms, currentUserId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getAllRooms:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

// POST /api/rooms
export async function createRoom(req, res) {
  try {
    const { name, topic, emoji } = req.body;
    const userId = req.user._id;

    if (!name || !topic) {
      return res.status(400).json({ message: "Name and topic are required" });
    }

    const roomId = "room-" + name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const existing = await Room.findOne({ roomId });
    if (existing) {
      return res.status(400).json({ message: "A room with this name already exists" });
    }

    const room = await Room.create({
      roomId,
      name,
      topic,
      emoji: emoji || "💬",
      createdBy: userId,
      members: [userId], // Creator is automatically a member
    });

    res.status(201).json({
      id: room.roomId,
      name: room.name,
      topic: room.topic,
      emoji: room.emoji,
      createdBy: room.createdBy,
      memberCount: 1,
      isJoined: true,
      lastMessage: null,
    });
  } catch (error) {
    console.error("Error in createRoom:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

// POST /api/rooms/:roomId/join
export async function joinRoom(req, res) {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    // Add user to members list if not already there
    const isAlreadyMember = room.members.some((id) => id.toString() === userId.toString());
    if (!isAlreadyMember) {
      room.members.push(userId);
      await room.save();
    }

    res.status(200).json({ roomId, name: room.name, topic: room.topic, emoji: room.emoji });
  } catch (error) {
    console.error("Error in joinRoom:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

// PATCH /api/rooms/:roomId
export async function updateRoom(req, res) {
  try {
    const { roomId } = req.params;
    const { name, topic, emoji } = req.body;

    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).json({ message: "Room not found" });

    if (room.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the room creator can edit this room" });
    }

    room.name = name || room.name;
    room.topic = topic || room.topic;
    room.emoji = emoji || room.emoji;
    await room.save();

    res.status(200).json({ message: "Room updated", room });
  } catch (error) {
    console.error("Error in updateRoom:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

// DELETE /api/rooms/:roomId
export async function deleteRoom(req, res) {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).json({ message: "Room not found" });

    if (room.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the room creator can delete this room" });
    }

    // Delete the room and all its messages
    await Room.deleteOne({ roomId });
    await Message.deleteMany({ room: roomId });

    res.status(200).json({ message: "Room deleted" });
  } catch (error) {
    console.error("Error in deleteRoom:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}