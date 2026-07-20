import mongoose from "mongoose";

const challengeSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        date: {
            type: String, // "YYYY-MM-DD" — one set per user per day
            required: true,
        },
        language: { type: String, required: true },
        challenges: [
            {
                type: { type: String, enum: ["translate", "vocab", "speaking"], required: true },
                prompt: { type: String, required: true },
                answer: { type: String },       // correct answer (translate/vocab only)
                options: [{ type: String }],     // for vocab multiple choice
                hint: { type: String },       // optional hint
                userAnswer: { type: String, default: "" },
                completed: { type: Boolean, default: false },
                correct: { type: Boolean, default: null },
                feedback: { type: String, default: "" },
            },
        ],
        score: { type: Number, default: 0 },
        completed: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// One set of challenges per user per day
challengeSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model("Challenge", challengeSchema);