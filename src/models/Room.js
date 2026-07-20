import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
    {
        roomId: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        topic: { type: String, required: true },
        emoji: { type: String, default: "💬" },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        members: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            }
        ]
    },
    { timestamps: true }
);

const Room = mongoose.model("Room", roomSchema);
export default Room;