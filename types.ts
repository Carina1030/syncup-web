
export interface User {
  id: string;
  name: string;
  role: 'Director' | 'Co-manager' | 'Member';
  badge?: string; // e.g., "💃 Dancer", "📷 Photographer", "🎤 Singer"
  email?: string; // Google email for identification
  photoURL?: string; // Google profile photo
}

// Preset badges for quick selection
export const MEMBER_BADGES = [
  { emoji: '💃', label: 'Dancer' },
  { emoji: '📷', label: 'Photographer' },
  { emoji: '🎤', label: 'Singer' },
  { emoji: '🎸', label: 'Musician' },
  { emoji: '🎬', label: 'Director' },
  { emoji: '🎨', label: 'Designer' },
  { emoji: '✍️', label: 'Writer' },
  { emoji: '🎭', label: 'Actor' },
  { emoji: '🎹', label: 'Pianist' },
  { emoji: '🥁', label: 'Drummer' },
  { emoji: '🎻', label: 'Violinist' },
  { emoji: '📝', label: 'Coordinator' },
  { emoji: '🎥', label: 'Videographer' },
  { emoji: '💄', label: 'Makeup' },
  { emoji: '👗', label: 'Stylist' },
] as const;

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
  date: string; // ISO date string (YYYY-MM-DD)
  time: string; // e.g., "10:00 AM"
  availableUsers: string[]; // List of user IDs
}

export interface DateRange {
  startDate: string; // ISO date string (YYYY-MM-DD)
  endDate: string; // ISO date string (YYYY-MM-DD)
}

export interface TimeRange {
  startTime: string; // e.g., "05:00 PM"
  endTime: string; // e.g., "11:00 PM"
}

export interface ProposedTimeSlot {
  date: string;
  time: string;
  availableCount: number;
  totalMembers: number;
  isAllAvailable: boolean;
}

export interface EventData {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  logistics: Logistics;
  dateRange: DateRange; // Date range for availability selection
  timeRange: TimeRange; // Time range for availability selection (e.g., 5PM-11PM)
  slots: AvailabilitySlot[];
  messages: Message[];
  members: User[];
  isLocked: boolean;
  lockedSlot?: string; // Format: "YYYY-MM-DD|HH:MM AM/PM"
  proposedTimeSlots?: ProposedTimeSlot[]; // Auto-generated common available slots
  approvedTimeSlot?: ProposedTimeSlot; // Director's selected time slot for approval
}
