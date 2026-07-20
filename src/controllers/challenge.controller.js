import Groq from "groq-sdk";
import Challenge from "../models/Challenge.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function todayString() {
    return new Date().toISOString().split("T")[0]; // "2026-03-24"
}

// GET /api/challenges/today
export async function getTodaysChallenges(req, res) {
    try {
        const userId = req.user._id;
        const language = req.user.learningLanguage;
        const date = todayString();

        if (!language) {
            return res.status(400).json({ message: "Complete your profile to set a learning language first." });
        }

        // Return cached challenges if already generated today
        const existing = await Challenge.findOne({ userId, date });
        if (existing) return res.status(200).json(existing);

        // Generate fresh challenges via Groq
        const generated = await generateChallenges(language);

        const doc = await Challenge.create({
            userId,
            date,
            language,
            challenges: generated,
        });

        res.status(201).json(doc);
    } catch (error) {
        console.error("Error in getTodaysChallenges:", error.message);
        res.status(500).json({ message: "Failed to generate challenges" });
    }
}

// POST /api/challenges/submit
export async function submitAnswer(req, res) {
    try {
        const { challengeId, challengeIndex, userAnswer } = req.body;
        const userId = req.user._id;

        const doc = await Challenge.findOne({ _id: challengeId, userId });
        if (!doc) return res.status(404).json({ message: "Challenge not found" });

        const challenge = doc.challenges[challengeIndex];
        if (!challenge) return res.status(400).json({ message: "Invalid challenge index" });
        if (challenge.completed) return res.status(400).json({ message: "Already answered" });

        // For speaking prompts — just mark complete, no right/wrong
        if (challenge.type === "speaking") {
            challenge.userAnswer = userAnswer;
            challenge.completed = true;
            challenge.correct = true;
            challenge.feedback = "Great practice! Speaking prompts are about building confidence.";
            doc.score += 10;
        } else {
            // Get AI feedback on the answer
            const feedback = await getAIFeedback(challenge, userAnswer);
            challenge.userAnswer = userAnswer;
            challenge.completed = true;
            challenge.correct = feedback.correct;
            challenge.feedback = feedback.explanation;
            if (feedback.correct) doc.score += challenge.type === "translate" ? 20 : 15;
        }

        // Check if all done
        doc.completed = doc.challenges.every((c) => c.completed);
        await doc.save();

        res.status(200).json({
            correct: challenge.correct,
            feedback: challenge.feedback,
            score: doc.score,
            allComplete: doc.completed,
        });
    } catch (error) {
        console.error("Error in submitAnswer:", error.message);
        res.status(500).json({ message: "Failed to submit answer" });
    }
}

// POST /api/challenges/refresh  — regenerate (once per day reset)
export async function refreshChallenges(req, res) {
    try {
        const userId = req.user._id;
        const language = req.user.learningLanguage;
        const date = todayString();

        await Challenge.deleteOne({ userId, date });
        const generated = await generateChallenges(language);
        const doc = await Challenge.create({ userId, date, language, challenges: generated });

        res.status(201).json(doc);
    } catch (error) {
        console.error("Error in refreshChallenges:", error.message);
        res.status(500).json({ message: "Failed to refresh challenges" });
    }
}

// ─── Helpers ────────────────────────────────────────────────

async function generateChallenges(language) {
    const prompt = `Generate exactly 3 language learning challenges for someone learning ${language}.
Return ONLY valid JSON — no markdown, no backticks, no explanation.

Format:
[
  {
    "type": "translate",
    "prompt": "Translate this sentence to ${language}: \\"[an English sentence]\\"",
    "answer": "[correct ${language} translation]",
    "hint": "[one grammar tip]"
  },
  {
    "type": "vocab",
    "prompt": "What does the ${language} word \\"[word]\\" mean in English?",
    "answer": "[correct English meaning]",
    "options": ["[correct answer]", "[wrong1]", "[wrong2]", "[wrong3]"],
    "hint": "[usage example]"
  },
  {
    "type": "speaking",
    "prompt": "Speaking challenge: [an engaging speaking prompt related to ${language} culture or daily life]",
    "hint": "[useful vocabulary for this topic]"
  }
]

Rules:
- translate: use natural everyday sentences, beginner to intermediate level
- vocab: shuffle the options array so correct answer isn't always first
- speaking: make it conversational and culturally interesting
- All prompts must be in English, answers in the appropriate language`;

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 1000,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    const json = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(json);
}

async function getAIFeedback(challenge, userAnswer) {
    const prompt = challenge.type === "translate"
        ? `The user was asked: "${challenge.prompt}"
       Correct answer: "${challenge.answer}"
       User's answer: "${userAnswer}"
       
       Is the user's answer correct or acceptable (allow minor variations)?
       Respond ONLY with JSON: {"correct": true/false, "explanation": "brief encouraging feedback in 1 sentence"}`
        : `Vocab question: "${challenge.prompt}"
       Correct answer: "${challenge.answer}"
       User selected: "${userAnswer}"
       
       Respond ONLY with JSON: {"correct": true/false, "explanation": "brief explanation in 1 sentence"}`;

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 150,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    const json = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(json);
}