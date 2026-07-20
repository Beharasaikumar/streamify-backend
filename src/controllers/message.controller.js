import Message from "../models/Message.js";

// GET /api/messages/dm/:userId - Get DM history with a user
export async function getDMHistory(req, res) {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const currentUserId = req.user._id;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, recipient: userId },
        { sender: userId, recipient: currentUserId },
      ],
      deletedBy: { $nin: [currentUserId] },
    })
      .populate("sender", "fullName profilePic")
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    res.status(200).json({
      messages: messages.reverse(),
      hasMore: messages.length === parseInt(limit),
    });
  } catch (error) {
    console.error("Error in getDMHistory:", error.message);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
}

// GET /api/messages/room/:roomId - Get room message history
export async function getRoomHistory(req, res) {
  try {
    const { roomId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const currentUserId = req.user._id;

    const messages = await Message.find({
      room: roomId,
      deletedBy: { $nin: [currentUserId] },
    })
      .populate("sender", "fullName profilePic")
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    res.status(200).json({
      messages: messages.reverse(),
      hasMore: messages.length === parseInt(limit),
    });
  } catch (error) {
    console.error("Error in getRoomHistory:", error.message);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
}

// GET /api/messages/unread - Get unread message counts
export async function getUnreadCounts(req, res) {
  try {
    const currentUserId = req.user._id;

    // Unread DMs
    const dmUnread = await Message.aggregate([
      {
        $match: {
          recipient: currentUserId,
          isRead: false,
          deletedBy: { $nin: [currentUserId] },
        },
      },
      {
        $group: {
          _id: "$sender",
          count: { $sum: 1 },
        },
      },
    ]);

    // Unread room messages (you might want to track per-user per-room reads differently)
    const roomUnread = await Message.aggregate([
      {
        $match: {
          room: { $exists: true, $ne: null },
          deletedBy: { $nin: [currentUserId] },
        },
      },
      {
        $group: {
          _id: "$room",
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      dmUnread: Object.fromEntries(dmUnread.map((u) => [u._id.toString(), u.count])),
      roomUnread: Object.fromEntries(roomUnread.map((r) => [r._id, r.count])),
    });
  } catch (error) {
    console.error("Error in getUnreadCounts:", error.message);
    res.status(500).json({ message: "Failed to fetch unread counts" });
  }
}

// DELETE /api/messages/:messageId - Soft delete a message
export async function deleteMessage(req, res) {
  try {
    const { messageId } = req.params;
    const currentUserId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Only sender or recipient can delete for themselves
    if (message.sender.toString() !== currentUserId.toString() &&
        message.recipient?.toString() !== currentUserId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Soft delete - add to deletedBy array
    await Message.findByIdAndUpdate(messageId, {
      $addToSet: { deletedBy: currentUserId },
    });

    res.status(200).json({ message: "Message deleted" });
  } catch (error) {
    console.error("Error in deleteMessage:", error.message);
    res.status(500).json({ message: "Failed to delete message" });
  }
}

// PATCH /api/messages/:messageId/read - Mark message as read
export async function markAsRead(req, res) {
  try {
    const { messageId } = req.params;

    await Message.findByIdAndUpdate(messageId, {
      isRead: true,
      readAt: new Date(),
    });

    res.status(200).json({ message: "Marked as read" });
  } catch (error) {
    console.error("Error in markAsRead:", error.message);
    res.status(500).json({ message: "Failed to mark as read" });
  }
}