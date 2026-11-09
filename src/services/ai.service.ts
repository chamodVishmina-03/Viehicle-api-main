import { GoogleGenAI } from "@google/genai"

// Tried in order. Set GEMINI_MODEL in .env to force a specific model.
// "gemini-flash-latest" always points at Google's newest Flash model.
const DEFAULT_MODELS = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.1-flash-lite"]
const getModels = () =>
  process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL, ...DEFAULT_MODELS] : DEFAULT_MODELS

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

let client: GoogleGenAI | null = null
const getClient = () => {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  if (!client) client = new GoogleGenAI({ apiKey })
  return client
}

/**
 * Produces a short, preliminary diagnosis from the customer's description.
 * Falls back to echoing the symptoms if AI is unavailable, so booking never breaks.
 * The reason for any fallback is printed in the API console.
 */
export const generateDiagnosis = async (
  vehicleInfo: string,
  symptoms: string
): Promise<string> => {
  const fallback = `Reported symptoms: ${symptoms.substring(0, 300)}`
  const ai = getClient()
  if (!ai) {
    console.warn("[AI] GEMINI_API_KEY is empty – add it to .env and restart the API.")
    return fallback
  }

  const prompt = `You are a senior automotive service advisor.
Vehicle: ${vehicleInfo}
Customer-reported symptoms: "${symptoms.substring(0, 2000)}"

Write a concise preliminary assessment (max 120 words) in plain prose:
1. The most likely causes (ranked).
2. Recommended inspection steps for the mechanic.
3. Whether the vehicle is safe to drive until inspected.
End with: "This is a preliminary AI suggestion; a physical inspection is required."`

  for (const model of getModels()) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          // Newer models spend part of this budget on internal reasoning, so keep it generous
          config: { temperature: 0.4, maxOutputTokens: 2000 }
        })
        const text = response.text?.trim()
        if (text) return text
        console.warn(`[AI] ${model} returned an empty response`)
        break
      } catch (error: any) {
        const code = error?.status || error?.error?.code
        const msg = String(error?.message || error).slice(0, 200)
        console.warn(`[AI] ${model} failed (${code ?? "no status"}): ${msg}`)
        if (code === 503 || code === 429) {
          await delay(attempt * 1000)
          continue
        }
        break // 400/401/403/404 etc. – try the next model
      }
    }
  }
  console.warn("[AI] All models failed – returning the plain symptoms text.")
  return fallback
}