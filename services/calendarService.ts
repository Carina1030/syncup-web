
import { CalendarEvent } from "../types";

/**
 * Fetches calendar data from external calendar API.
 * In a real app, this would use Google OAuth / Apple Calendar API.
 * Currently returns empty array - users can add events manually via the UI.
 */
export async function fetchUserCalendar(): Promise<CalendarEvent[]> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  // Return empty array - users will add events via the form
  return [];
}
