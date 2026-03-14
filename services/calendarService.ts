import { CalendarEvent } from "../types";
import { ALL_TIME_SLOTS } from "../constants";

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/**
 * Convert a Date object to our time slot format (e.g., "10:00 AM").
 * Snaps to the nearest available slot within 30 minutes.
 */
function toTimeSlot(date: Date): string | null {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const formatted = `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;

  if ((ALL_TIME_SLOTS as readonly string[]).includes(formatted)) {
    return formatted;
  }

  const totalMinutes = hours * 60 + minutes;
  for (const slot of ALL_TIME_SLOTS) {
    const [time, slotPeriod] = slot.split(' ');
    const [h, m] = time.split(':').map(Number);
    let slotMinutes = (h % 12) * 60 + m;
    if (slotPeriod === 'PM' && h !== 12) slotMinutes += 12 * 60;
    if (slotPeriod === 'AM' && h === 12) slotMinutes = m;

    if (Math.abs(slotMinutes - totalMinutes) <= 30) {
      return slot;
    }
  }
  return null;
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Fetch events from Google Calendar for a date range.
 * For multi-day events or all-day events, they are expanded into each
 * overlapping date within the range.
 */
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  startDate?: string,
  endDate?: string
): Promise<CalendarEvent[]> {
  const timeMin = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
  timeMin.setHours(0, 0, 0, 0);

  const timeMax = endDate ? new Date(`${endDate}T23:59:59`) : new Date(timeMin);
  if (!endDate) timeMax.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const body = await response.text();
    console.error('Google Calendar API error:', response.status, body);
    throw new Error(`Google Calendar API error: ${response.status}`);
  }

  const data = await response.json();
  const events: CalendarEvent[] = [];

  for (const item of data.items || []) {
    if (item.status === 'cancelled') continue;

    const startStr: string | undefined = item.start?.dateTime || item.start?.date;
    const endStr: string | undefined = item.end?.dateTime || item.end?.date;
    if (!startStr) continue;

    const isAllDay = !item.start?.dateTime;

    if (isAllDay) {
      // All-day events span multiple dates — mark every hour as conflict for each day
      // Google returns end date as exclusive, e.g. start=2025-03-10, end=2025-03-11 means just Mar 10
      const allDayStart = new Date(`${startStr}T00:00:00`);
      const allDayEnd = endStr ? new Date(`${endStr}T00:00:00`) : new Date(allDayStart.getTime() + 86400000);
      const cursor = new Date(allDayStart);
      while (cursor < allDayEnd) {
        const dateStr = toDateString(cursor);
        for (const slot of ALL_TIME_SLOTS) {
          events.push({
            id: `${item.id}-${dateStr}-${slot}`,
            title: item.summary || 'All Day Event',
            date: dateStr,
            startTime: slot,
            durationMinutes: 60,
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      const eventStart = new Date(startStr);
      const eventEnd = endStr ? new Date(endStr) : new Date(eventStart.getTime() + 3600000);
      const durationMinutes = Math.round((eventEnd.getTime() - eventStart.getTime()) / 60000) || 60;
      const dateStr = toDateString(eventStart);
      const slot = toTimeSlot(eventStart);
      if (!slot) continue;

      events.push({
        id: item.id || `gcal-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        title: item.summary || 'Untitled Event',
        date: dateStr,
        startTime: slot,
        durationMinutes,
      });
    }
  }

  return events;
}

/**
 * Quick check: try a lightweight request to see if the token is still valid.
 */
export async function isGoogleCalendarConnected(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/primary?fields=summary`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return res.ok;
  } catch {
    return false;
  }
}
