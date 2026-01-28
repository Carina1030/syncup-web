import { AvailabilitySlot, ProposedTimeSlot, User } from '../types';
import { formatDateShort } from './dateUtils';

/**
 * Analyze availability and find common available time slots
 * Uses the time slots from the event's slots array (respects timeRange)
 */
export function analyzeAvailability(
  slots: AvailabilitySlot[],
  members: User[],
  dateRange: { startDate: string; endDate: string }
): ProposedTimeSlot[] {
  const totalMembers = members.length;
  const proposedSlots: ProposedTimeSlot[] = [];

  // Use the slots directly - they already contain the filtered time slots
  slots.forEach(slot => {
    const availableCount = slot.availableUsers.length;
    const isAllAvailable = availableCount === totalMembers && totalMembers > 0;

    proposedSlots.push({
      date: slot.date,
      time: slot.time,
      availableCount,
      totalMembers,
      isAllAvailable,
    });
  });

  // Sort by: all available first, then by available count (descending)
  return proposedSlots.sort((a, b) => {
    if (a.isAllAvailable && !b.isAllAvailable) return -1;
    if (!a.isAllAvailable && b.isAllAvailable) return 1;
    return b.availableCount - a.availableCount;
  });
}

/**
 * Get best available time slots (all members available)
 */
export function getBestAvailableSlots(proposedSlots: ProposedTimeSlot[]): ProposedTimeSlot[] {
  return proposedSlots.filter(slot => slot.isAllAvailable);
}

/**
 * Get top available time slots (by availability percentage)
 */
export function getTopAvailableSlots(
  proposedSlots: ProposedTimeSlot[],
  minPercentage: number = 0.8
): ProposedTimeSlot[] {
  return proposedSlots.filter(slot => {
    if (slot.totalMembers === 0) return false;
    const percentage = slot.availableCount / slot.totalMembers;
    return percentage >= minPercentage;
  });
}

/**
 * Format time slot for display
 */
export function formatTimeSlot(slot: ProposedTimeSlot): string {
  return `${formatDateShort(slot.date)} at ${slot.time}`;
}
