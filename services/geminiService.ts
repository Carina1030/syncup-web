
import { GoogleGenAI, Type } from "@google/genai";
import { Logistics } from "../types";

export async function parseLogisticsFromChat(
  message: string,
  currentLogistics: Logistics
): Promise<Partial<Logistics> | null> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Current Logistics:
      Venue: ${currentLogistics.venue}
      Wardrobe: ${currentLogistics.wardrobe}
      Materials: ${currentLogistics.materials}
      Notes: ${currentLogistics.notes}

      User Message: "${message}"

      Task: If the user message contains instructions to update specific logistic details, extract them. If not, return an empty object or null. Only return updates for Venue, Wardrobe, Materials, or Notes.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            venue: { type: Type.STRING },
            wardrobe: { type: Type.STRING },
            materials: { type: Type.STRING },
            notes: { type: Type.STRING }
          }
        }
      }
    });

    const result = JSON.parse(response.text);
    // Filter out empty values
    const updates: Partial<Logistics> = {};
    if (result.venue) updates.venue = result.venue;
    if (result.wardrobe) updates.wardrobe = result.wardrobe;
    if (result.materials) updates.materials = result.materials;
    if (result.notes) updates.notes = result.notes;

    return Object.keys(updates).length > 0 ? updates : null;
  } catch (error) {
    console.error("AI Logistics Parsing Error:", error);
    return null;
  }
}
