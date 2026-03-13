import { AvailabilitySlot, ProposedTimeSlot, User } from '../types';
import { formatDateShort } from './dateUtils';
import { ALL_TIME_SLOTS } from '../constants';

export interface MergedTimeRange {
  date: string;
  startTime: string;
  endTime: string;
  availableUserIds: string[];
  missingUserIds: string[];
  totalMembers: number;
  availableCount: number;
  isAllAvailable: boolean;
}

function getNextHour(time: string): string {
  const idx = ALL_TIME_SLOTS.indexOf(time as typeof ALL_TIME_SLOTS[number]);
  if (idx !== -1 && idx < ALL_TIME_SLOTS.length - 1) {
    return ALL_TIME_SLOTS[idx + 1];
  }
  return '12:00 AM';
}

function sameUserSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every(id => setA.has(id));
}

/**
 * Analyze availability and return merged consecutive time ranges grouped by availability.
 */
export function analyzeAvailabilityMerged(
  slots: AvailabilitySlot[],
  members: User[],
): MergedTimeRange[] {
  const totalMembers = members.length;
  if (totalMembers === 0) return [];

  const memberIds = new Set(members.map(m => m.id));

  const slotMap = new Map<string, string[]>();
  for (const slot of slots) {
    const available = slot.availableUsers.filter(uid => memberIds.has(uid));
    if (available.length > 0) {
      slotMap.set(`${slot.date}|${slot.time}`, available);
    }
  }

  const dateSlots = new Map<string, AvailabilitySlot[]>();
  for (const slot of slots) {
    const available = slot.availableUsers.filter(uid => memberIds.has(uid));
    if (available.length === 0) continue;
    if (!dateSlots.has(slot.date)) dateSlots.set(slot.date, []);
    dateSlots.get(slot.date)!.push(slot);
  }

  const merged: MergedTimeRange[] = [];

  for (const [date, dateSlotList] of dateSlots) {
    dateSlotList.sort((a, b) => {
      const idxA = ALL_TIME_SLOTS.indexOf(a.time as typeof ALL_TIME_SLOTS[number]);
      const idxB = ALL_TIME_SLOTS.indexOf(b.time as typeof ALL_TIME_SLOTS[number]);
      return idxA - idxB;
    });

    let rangeStart: string | null = null;
    let rangeEnd: string | null = null;
    let currentAvailable: string[] = [];

    for (let i = 0; i < dateSlotList.length; i++) {
      const slot = dateSlotList[i];
      const available = slot.availableUsers.filter(uid => memberIds.has(uid));

      if (rangeStart === null) {
        rangeStart = slot.time;
        rangeEnd = slot.time;
        currentAvailable = [...available].sort();
        continue;
      }

      const prevIdx = ALL_TIME_SLOTS.indexOf(rangeEnd as typeof ALL_TIME_SLOTS[number]);
      const currIdx = ALL_TIME_SLOTS.indexOf(slot.time as typeof ALL_TIME_SLOTS[number]);
      const isConsecutive = currIdx === prevIdx + 1;
      const sameUsers = sameUserSet(available, currentAvailable);

      if (isConsecutive && sameUsers) {
        rangeEnd = slot.time;
      } else {
        const missing = members.filter(m => !currentAvailable.includes(m.id)).map(m => m.id);
        merged.push({
          date,
          startTime: rangeStart,
          endTime: getNextHour(rangeEnd!),
          availableUserIds: [...currentAvailable],
          missingUserIds: missing,
          totalMembers,
          availableCount: currentAvailable.length,
          isAllAvailable: currentAvailable.length === totalMembers,
        });
        rangeStart = slot.time;
        rangeEnd = slot.time;
        currentAvailable = [...available].sort();
      }
    }

    if (rangeStart !== null) {
      const missing = members.filter(m => !currentAvailable.includes(m.id)).map(m => m.id);
      merged.push({
        date,
        startTime: rangeStart,
        endTime: getNextHour(rangeEnd!),
        availableUserIds: [...currentAvailable],
        missingUserIds: missing,
        totalMembers,
        availableCount: currentAvailable.length,
        isAllAvailable: currentAvailable.length === totalMembers,
      });
    }
  }

  merged.sort((a, b) => {
    if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const idxA = ALL_TIME_SLOTS.indexOf(a.startTime as typeof ALL_TIME_SLOTS[number]);
    const idxB = ALL_TIME_SLOTS.indexOf(b.startTime as typeof ALL_TIME_SLOTS[number]);
    return idxA - idxB;
  });

  return merged;
}

/**
 * Legacy: Analyze availability per individual slot
 */
export function analyzeAvailability(
  slots: AvailabilitySlot[],
  members: User[],
  _dateRange?: { startDate: string; endDate: string }
): ProposedTimeSlot[] {
  const totalMembers = members.length;
  const proposedSlots: ProposedTimeSlot[] = [];

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

  return proposedSlots.sort((a, b) => {
    if (a.isAllAvailable && !b.isAllAvailable) return -1;
    if (!a.isAllAvailable && b.isAllAvailable) return 1;
    return b.availableCount - a.availableCount;
  });
}

export function formatTimeSlot(slot: ProposedTimeSlot): string {
  return `${formatDateShort(slot.date)} at ${slot.time}`;
}
