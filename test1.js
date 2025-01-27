import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import { schedule } from "node-cron";

// Load environment variables
dotenv.config();

// Initialize DeepSeek API
const openai = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// Initialize Express
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Mock data for riddles and hints
const riddles = [
  {
    level: 1,
    question:
      "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?",
    answer: "echo",
    hints: [
      "It repeats what you say.",
      "It's related to sound.",
      "It's often heard in valleys.",
    ],
  },
  {
    level: 2,
    question: "The more you take, the more you leave behind. What am I?",
    answer: "footsteps",
    hints: [
      "It's related to walking.",
      "It's something you leave behind.",
      "It's often seen on sand.",
    ],
  },
  // Add more riddles for levels 3 to 49...
];

const removeTripleBackticksAndJson = (jsonString) => {
  if (jsonString.startsWith("```json") && jsonString.endsWith("```")) {
    return jsonString.slice(7, -3).trim();
  }
  return jsonString;
};

// Function to generate a riddle using DeepSeek API
const generateRiddle = async (level) => {
  try {
    const prompt = `Generate a riddle for level ${level}. The riddle should have a question, a one-word answer, and three hints. Format the response as Object:
{
  "question": "The riddle question",
  "answer": "One-word answer",
  "hints": ["Hint 1", "Hint 2", "Hint 3"]
}`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "deepseek-chat",
    });

    const response = completion.choices[0].message.content;
    console.log(response);
    const riddle = JSON.parse(removeTripleBackticksAndJson(response));
    return { level, ...riddle };
  } catch (error) {
    console.error("Failed to generate riddle:", error);
    return null;
  }
};

// Function to generate riddles for all 49 levels and store them in JSON
const generateAndStoreRiddles = async () => {
  for (let level = 1; level <= 49; level++) {
    const riddle = await generateRiddle(level);
    if (riddle) {
      riddles.push(riddle);
      console.log(`Riddle for level ${level} stored.`);
    } else {
      console.log(`Failed to generate riddle for level ${level}.`);
    }
  }
};

// Schedule daily riddle generation at midnight
schedule("0 0 * * *", () => {
  console.log("Generating riddles for all 49 levels...");
  generateAndStoreRiddles();
});

// API 1: Get Riddle by Level
app.get("/getRiddle/:level", async (req, res) => {
  const level = parseInt(req.params.level);
  if (level < 1 || level > 49) {
    return res.status(400).json({ error: "Level must be between 1 and 49." });
  }

  const riddle = await generateRiddle(level);
  console.log(riddle);

  if (!riddle) {
    return res.status(404).json({ error: "Riddle not found for this level." });
  }

  res.json({ Question: riddle.question, Answer: riddle.answer });
});

// API 2: Get Hints by Level
app.get("/getHints/:level", (req, res) => {
  const level = parseInt(req.params.level);
  if (level < 1 || level > 49) {
    return res.status(400).json({ error: "Level must be between 1 and 49." });
  }

  const riddle = riddles.find((r) => r.level === level);
  if (!riddle) {
    return res.status(404).json({ error: "Hints not found for this level." });
  }

  res.json({ hints: riddle.hints });
});

// API 3: Validate Answer with DeepSeek
app.post("/validateAnswer", async (req, res) => {
  const { level, userAnswer } = req.body;
  if (!level || !userAnswer) {
    return res
      .status(400)
      .json({ error: "Level and userAnswer are required." });
  }

  const riddle = riddles.find((r) => r.level === level);
  if (!riddle) {
    return res.status(404).json({ error: "Riddle not found for this level." });
  }

  const correctAnswer = riddle.answer;

  // Call DeepSeek to validate the answer
  const prompt = `Is "${userAnswer}" the correct answer to the riddle: "${riddle.question}"? The correct answer is "${correctAnswer}". Respond with "true" if the answer is correct, otherwise respond with "false" and provide a brief reasoning.`;
  const completion = await openai.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "deepseek-chat",
  });

  const response =
    completion.choices[0].message.content || "No reasoning provided";
  const isCorrect = response.toLowerCase().includes("true");

  res.json({ Answer: isCorrect, Reasoning: response });
});

// API 4: Ask AI for Reasoning (Fallback)
app.post("/askAIForReasoning", async (req, res) => {
  const { question, userAnswer } = req.body;
  if (!question || !userAnswer) {
    return res
      .status(400)
      .json({ error: "Question and userAnswer are required." });
  }

  try {
    const prompt = `Is "${userAnswer}" the correct answer to the riddle: "${question}"? Respond with "true" if the answer is correct, otherwise respond with "false" and provide a brief reasoning.`;
    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "deepseek-chat",
    });

    const response =
      completion.choices[0].message.content || "No reasoning provided";
    const isCorrect = response.toLowerCase().includes("true");

    res.json({ Answer: isCorrect, Reasoning: response });
  } catch (error) {
    res.status(500).json({ error: "Failed to get reasoning from AI." });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
