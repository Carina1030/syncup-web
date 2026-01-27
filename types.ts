
export interface User {
  id: string;
  name: string;
  role: 'Director' | 'Co-manager' | 'Member';
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // e.g., "10:00 AM" matching our grid slots
  durationMinutes: number;
}

export interface Logistics {
  venue: string;
  wardrobe: string;
  materials: string;
  notes: string;
  lastUpdatedBy?: string;
}

export interface Message {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface AvailabilitySlot {
  time: string; // ISO string or simple string like "10:00 AM"
  availableUsers: string[]; // List of user IDs
}

export interface EventData {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  logistics: Logistics;
  slots: AvailabilitySlot[];
  messages: Message[];
  members: User[];
  isLocked: boolean;
  lockedSlot?: string;
}
