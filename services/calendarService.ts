import { CalendarEvent } from "../types";
import { TIME_SLOTS } from "../constants";
import { 
  fetchCalDAVEvents, 
  getICloudCalDAVUrl, 
  isCalDAVConfigured,
  getCalDAVCredentials,
  CalDAVCredentials
} from "./appleCalendarAuth";

// Demo calendar events for demonstration purposes
const DEMO_CALENDAR_EVENTS: CalendarEvent[] = [
  { id: 'demo-1', title: 'Team Meeting', startTime: '10:00 AM', durationMinutes: 60 },
  { id: 'demo-2', title: 'Lunch Break', startTime: '12:00 PM', durationMinutes: 60 },
  { id: 'demo-3', title: 'Client Call', startTime: '02:00 PM', durationMinutes: 30 },
  { id: 'demo-4', title: 'Gym Session', startTime: '06:00 PM', durationMinutes: 90 },
];

/**
 * Convert ISO date string to time slot format (e.g., "10:00 AM")
 */
function convertToTimeSlot(dateTime: string): string | null {
  try {
    const date = new Date(dateTime);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    const timeSlot = `${displayHours}:${displayMinutes} ${period}`;
    
    // Check if time slot exists in our available slots
    if (TIME_SLOTS.includes(timeSlot)) {
      return timeSlot;
    }
    
    // Find closest time slot
    const timeInMinutes = hours * 60 + minutes;
    for (const slot of TIME_SLOTS) {
      const [time, period] = slot.split(' ');
      const [h, m] = time.split(':').map(Number);
      let slotMinutes = h % 12 * 60 + m;
      if (period === 'PM' && h !== 12) slotMinutes += 12 * 60;
      if (period === 'AM' && h === 12) slotMinutes = m;
      
      if (Math.abs(slotMinutes - timeInMinutes) <= 30) {
        return slot;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error converting date:', error);
    return null;
  }
}

/**
 * Parse iCal format event to CalendarEvent
 */
function parseICalEvent(iCalData: string): CalendarEvent | null {
  try {
    // Simple iCal parser (for basic events)
    const lines = iCalData.split('\n');
    let summary = '';
    let dtstart = '';
    let dtend = '';
    let uid = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('SUMMARY:')) {
        summary = line.substring(8);
      } else if (line.startsWith('DTSTART')) {
        const value = line.includes(':') ? line.split(':')[1] : lines[i + 1]?.trim();
        dtstart = value || '';
      } else if (line.startsWith('DTEND')) {
        const value = line.includes(':') ? line.split(':')[1] : lines[i + 1]?.trim();
        dtend = value || '';
      } else if (line.startsWith('UID:')) {
        uid = line.substring(4);
      }
    }

    if (!dtstart) return null;

    // Parse date (handle both DATE and DATE-TIME formats)
    let startDate: Date;
    if (dtstart.length === 8) {
      // DATE format: YYYYMMDD
      const year = parseInt(dtstart.substring(0, 4));
      const month = parseInt(dtstart.substring(4, 6)) - 1;
      const day = parseInt(dtstart.substring(6, 8));
      startDate = new Date(year, month, day);
    } else {
      // DATE-TIME format
      startDate = new Date(dtstart.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
    }

    let endDate: Date;
    if (dtend) {
      if (dtend.length === 8) {
        const year = parseInt(dtend.substring(0, 4));
        const month = parseInt(dtend.substring(4, 6)) - 1;
        const day = parseInt(dtend.substring(6, 8));
        endDate = new Date(year, month, day);
      } else {
        endDate = new Date(dtend.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
      }
    } else {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour
    }

    const timeSlot = convertToTimeSlot(startDate.toISOString());
    if (!timeSlot) return null;

    const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));

    return {
      id: uid || `ical-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: summary || 'Untitled Event',
      startTime: timeSlot,
      durationMinutes: durationMinutes || 60,
    };
  } catch (error) {
    console.error('Error parsing iCal event:', error);
    return null;
  }
}

/**
 * Fetch events from Apple Calendar via CalDAV
 */
async function fetchAppleCalendarEvents(
  credentials: CalDAVCredentials,
  date: Date = new Date()
): Promise<CalendarEvent[]> {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch events from CalDAV
    const iCalEvents = await fetchCalDAVEvents(
      credentials.serverUrl,
      credentials.username,
      credentials.password,
      startOfDay,
      endOfDay
    );

    const events: CalendarEvent[] = [];
    
    for (const iCalData of iCalEvents) {
      const event = parseICalEvent(iCalData);
      if (event) {
        events.push(event);
      }
    }

    return events;
  } catch (error) {
    console.error('Error fetching Apple Calendar events:', error);
    throw error;
  }
}

/**
 * Fetches calendar data from Apple Calendar (iCloud) via CalDAV or returns demo data.
 * 
 * @param useRealCalendar - If true, attempts to fetch from Apple Calendar. If false or not authenticated, returns demo data.
 * @param useDemoData - Fallback to demo data if real calendar fails
 */
export async function fetchUserCalendar(
  useRealCalendar: boolean = false,
  useDemoData: boolean = true
): Promise<CalendarEvent[]> {
  // If using real calendar, try to fetch from Apple Calendar
  if (useRealCalendar && isCalDAVConfigured()) {
    try {
      const credentials = getCalDAVCredentials();
      if (!credentials) {
        throw new Error('CalDAV credentials not found');
      }

      const events = await fetchAppleCalendarEvents(credentials);
      return events;
    } catch (error) {
      console.error('Failed to fetch from Apple Calendar:', error);
      // Fall back to demo data if enabled
      if (useDemoData) {
        console.log('Falling back to demo calendar data');
        await new Promise(resolve => setTimeout(resolve, 800));
        return DEMO_CALENDAR_EVENTS.map(event => ({
          ...event,
          id: `${event.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }));
      }
      throw error;
    }
  }

  // Use demo data
  if (useDemoData) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return DEMO_CALENDAR_EVENTS.map(event => ({
      ...event,
      id: `${event.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }));
  }

  return [];
}

/**
 * Check if Apple Calendar is configured
 */
export function checkAppleCalendarAuth(): boolean {
  return isCalDAVConfigured();
}

/**
 * Authenticate with Apple Calendar (iCloud)
 */
export async function authenticateAppleCalendar(
  username: string,
  password: string,
  serverUrl?: string
): Promise<boolean> {
  try {
    const url = serverUrl || getICloudCalDAVUrl(username);
    
    // Test connection
    await fetchCalDAVEvents(url, username, password);
    
    // Store credentials if connection successful
    const { setCalDAVCredentials } = await import('./appleCalendarAuth');
    setCalDAVCredentials({
      serverUrl: url,
      username,
      password,
    });
    
    return true;
  } catch (error) {
    console.error('Failed to authenticate with Apple Calendar:', error);
    return false;
  }
}

/**
 * Disconnect from Apple Calendar
 */
export async function disconnectAppleCalendar(): Promise<void> {
  const { clearCalDAVCredentials } = await import('./appleCalendarAuth');
  clearCalDAVCredentials();
}

/**
 * Generates random calendar events for testing/demo purposes
 */
export function generateRandomCalendarEvents(count: number = 3): CalendarEvent[] {
  const eventTitles = [
    'Team Meeting', 'Lunch Break', 'Client Call', 'Gym Session',
    'Doctor Appointment', 'Coffee Chat', 'Project Review', 'Training Session',
    'Conference Call', 'Personal Time', 'Workout', 'Study Session'
  ];
  
  const events: CalendarEvent[] = [];
  const usedTimes = new Set<string>();
  
  for (let i = 0; i < count && usedTimes.size < TIME_SLOTS.length; i++) {
    let timeSlot: string;
    do {
      timeSlot = TIME_SLOTS[Math.floor(Math.random() * TIME_SLOTS.length)];
    } while (usedTimes.has(timeSlot));
    
    usedTimes.add(timeSlot);
    
    events.push({
      id: `random-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      title: eventTitles[Math.floor(Math.random() * eventTitles.length)],
      startTime: timeSlot,
      durationMinutes: [30, 60, 90, 120][Math.floor(Math.random() * 4)]
    });
  }
  
  return events;
}
