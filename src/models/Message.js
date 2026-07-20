import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null for group messages
    },
    room: {
      type: String, // roomId for group chats
      default: null,
    },
    text: {
      type: String,
      required: true,
    },
    // For future: attachments, images, etc.
    attachments: [
      {
        type: String, // URL
        mediaType: String, // image, video, file, etc.
      },
    ],
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    deletedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ], // soft delete per user
  },
  { timestamps: true }
);

// Index for quick lookups
messageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
messageSchema.index({ room: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, isRead: 1 });

export default mongoose.model("Message", messageSchema);