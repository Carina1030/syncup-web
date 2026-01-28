import { Logistics } from "../types";

/**
 * Parse logistics from chat message
 * Note: AI parsing is disabled in production due to browser compatibility issues.
 * This function returns null and logistics must be updated manually through the Logistics Hub.
 */
export async function parseLogisticsFromChat(
  message: string,
  currentLogistics: Logistics
): Promise<Partial<Logistics> | null> {
  // AI parsing disabled - @google/genai uses require() which doesn't work in browsers
  // Users can update logistics manually through the Logistics Hub interface
  console.log("AI logistics parsing is disabled in this build");
  return null;
}
