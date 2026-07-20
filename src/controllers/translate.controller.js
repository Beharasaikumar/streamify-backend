import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import os from "os";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function translateText(req, res) {
  try {
    const { text, targetLanguage } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({ message: "text and targetLanguage are required" });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate the user's text to ${targetLanguage}.
Return ONLY the translated text — no explanations, no notes, no alternatives, no quotation marks.
Just the clean translation.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });

    const translated = completion.choices[0]?.message?.content?.trim();
    res.status(200).json({ translated });
  } catch (error) {
    console.error("Error in translateText:", error.message);
    res.status(500).json({ message: "Translation failed" });
  }
}

export async function transcribeAudio(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Audio file is required" });
    }

    // Write buffer to a temp file — Groq SDK needs a file path
    const tmpPath = path.join(os.tmpdir(), `audio-${Date.now()}.webm`);
    fs.writeFileSync(tmpPath, req.file.buffer);

    const transcription = await groq.audio.transcriptions.create({
      file:  fs.createReadStream(tmpPath),
      model: "whisper-large-v3",
    });

    // Clean up temp file
    fs.unlinkSync(tmpPath);

    res.status(200).json({ text: transcription.text });
  } catch (error) {
    console.error("Error in transcribeAudio:", error.message);
    res.status(500).json({ message: "Transcription failed" });
  }
}