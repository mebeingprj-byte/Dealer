import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";

const MODEL_NAME = "gemini-1.5-pro-latest";

// VERCEL: This is where your Environment Variable will be loaded.
const API_KEY = process.env.GEMINI_API_KEY;

export default async function handler(req, res) {
  // 1. Check for API Key
  if (!API_KEY) {
    return res.status(500).json({ error: "API key not configured." });
  }

  // 2. Ensure POST request
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const genAI = new GoogleGenerativeAI(API_KEY);

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    // Instruct the model to ONLY output valid JSON.
    responseMimeType: "application/json",
  });

  // 3. Parse incoming request body
  const { systemPrompt, history, userMessage } = req.body;

  if (!systemPrompt || !history || !userMessage) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  // 4. Construct the full prompt for the model
  // The history array is already formatted. We just add the system prompt and the new message.
  const fullHistory = [
    {
      role: "user",
      parts: [{ text: systemPrompt }],
    },
    {
      role: "model",
      parts: [
        {
          text: '{"response": "Understood. I am ready to begin the simulation.", "score_change": 0}',
        },
      ],
    },
    ...history,
    {
      role: "user",
      parts: [{ text: userMessage }],
    },
  ];

  // 5. Set safety settings
  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ];

  try {
    // 6. Call the AI model
    const chat = model.startChat({
      history: fullHistory,
      safetySettings,
    });

    // We send an empty message because the full history is already in startChat
    const result = await chat.sendMessage("");
    const responseText = result.response.text();

    // 7. Send the JSON response back to the frontend
    res.status(200).json(JSON.parse(responseText));
  } catch (error) {
    console.error("AI API Error:", error);
    res.status(500).json({
      error: "Failed to fetch AI response.",
      details: error.message,
    });
  }
}
