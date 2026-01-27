import { AvailabilitySlot, ProposedTimeSlot, User } from '../types';
import { TIME_SLOTS } from '../constants';
import { getDatesInRange } from './dateUtils';

/**
 * Analyze availability and find common available time slots
 */
export function analyzeAvailability(
  slots: AvailabilitySlot[],
  members: User[],
  dateRange: { startDate: string; endDate: string }
): ProposedTimeSlot[] {
  const dates = getDatesInRange(dateRange.startDate, dateRange.endDate);
  const totalMembers = members.length;
  const proposedSlots: ProposedTimeSlot[] = [];

  // Group slots by date and time
  const slotMap = new Map<string, AvailabilitySlot>();
  slots.forEach(slot => {
    const key = `${slot.date}|${slot.time}`;
    slotMap.set(key, slot);
  });

  // Check each date and time combination
  dates.forEach(date => {
    TIME_SLOTS.forEach(time => {
      const key = `${date}|${time}`;
      const slot = slotMap.get(key);
      const availableCount = slot?.availableUsers.length || 0;
      const isAllAvailable = availableCount === totalMembers && totalMembers > 0;

      proposedSlots.push({
        date,
        time,
        availableCount,
        totalMembers,
        isAllAvailable,
      });
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
  const { formatDateShort } = require('./dateUtils');
  return `${formatDateShort(slot.date)} at ${slot.time}`;
}
