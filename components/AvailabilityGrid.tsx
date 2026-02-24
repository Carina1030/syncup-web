import React, { useState, useRef, useCallback, useMemo } from 'react';
import { ALL_TIME_SLOTS, Icons } from '../constants';
import { AvailabilitySlot, User, CalendarEvent, DateRange, ProposedTimeSlot, TimeRange } from '../types';
import { getDatesInRange, formatDateShort, getDayOfWeek, isToday, parseDate } from '../utils/dateUtils';

interface AvailabilityGridProps {
  slots: AvailabilitySlot[];
  currentUser: User;
  members: User[];
  dateRange: DateRange;
  timeRange?: TimeRange; // Optional time range filter
  onToggle: (date: string, time: string, isAvailable: boolean) => void;
  onBatchToggle?: (updates: Array<{ date: string; time: string; isAvailable: boolean }>) => void;
  isLocked: boolean;
  lockedSlot?: string;
  calendarEvents: CalendarEvent[];
  isSyncing: boolean;
  onSyncCalendar: () => void;
  onClearCalendar?: () => void;
  isAppleCalendarConnected?: boolean;
  appleCalendarEmail?: string | null;
  onConnectAppleCalendar?: () => void;
  onDisconnectAppleCalendar?: () => void;
  proposedTimeSlots?: ProposedTimeSlot[];
  approvedTimeSlot?: ProposedTimeSlot;
  onAnalyze?: () => void;
  onSelectTimeSlot?: (slot: ProposedTimeSlot) => void;
  onSendForApproval?: () => void;
  canEdit?: boolean;
}

const AvailabilityGrid: React.FC<AvailabilityGridProps> = ({ 
  slots, 
  currentUser, 
  members, 
  dateRange,
  timeRange,
  onToggle,
  onBatchToggle,
  isLocked,
  lockedSlot,
  calendarEvents,
  isSyncing,
  onSyncCalendar,
  onClearCalendar,
  isAppleCalendarConnected = false,
  appleCalendarEmail = null,
  onConnectAppleCalendar,
  onDisconnectAppleCalendar,
  proposedTimeSlots,
  approvedTimeSlot,
  onAnalyze,
  onSelectTimeSlot,
  onSendForApproval,
  canEdit = false
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const dates = getDatesInRange(dateRange.startDate, dateRange.endDate);
    return dates[0] || dateRange.startDate;
  });

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'select' | 'deselect'>('select');
  const [draggedIndices, setDraggedIndices] = useState<Set<number>>(new Set());
  const dragStartIndex = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [showCopyMenu, setShowCopyMenu] = useState(false);

  const dates = getDatesInRange(dateRange.startDate, dateRange.endDate);

  // Filter time slots based on timeRange
  const TIME_SLOTS = useMemo(() => {
    if (!timeRange) return ALL_TIME_SLOTS;
    const startIdx = ALL_TIME_SLOTS.indexOf(timeRange.startTime as typeof ALL_TIME_SLOTS[number]);
    const endIdx = ALL_TIME_SLOTS.indexOf(timeRange.endTime as typeof ALL_TIME_SLOTS[number]);
    if (startIdx === -1 || endIdx === -1) return ALL_TIME_SLOTS;
    return ALL_TIME_SLOTS.slice(startIdx, endIdx + 1);
  }, [timeRange]);

  const getHeatmapColor = (slot: AvailabilitySlot) => {
    if (isLocked) {
      const lockedKey = lockedSlot?.split('|');
      if (lockedKey && slot.date === lockedKey[0] && slot.time === lockedKey[1]) {
        return 'bg-indigo-600';
      }
      return 'bg-gray-100';
    }
    const count = slot.availableUsers.length;
    const total = members.length;
    if (total === 0) return 'bg-gray-100';
    const ratio = count / total;
    if (ratio === 0) return 'bg-white border-gray-200';
    if (ratio < 0.3) return 'bg-emerald-100';
    if (ratio < 0.6) return 'bg-emerald-300';
    if (ratio < 0.9) return 'bg-emerald-500';
    return 'bg-emerald-700';
  };

  const isUserAvailable = (slot: AvailabilitySlot) => {
    return slot.availableUsers.includes(currentUser.id);
  };

  const getConflict = (time: string) => {
    return calendarEvents.find(e => e.startTime === time);
  };

  const handleSlotClick = (date: string, time: string) => {
    if (isLocked || isDragging) return;
    const slot = slots.find(s => s.date === date && s.time === time);
    const currentlyAvailable = slot?.availableUsers.includes(currentUser.id) || false;
    onToggle(date, time, !currentlyAvailable);
  };

  const getSlotsForDate = (date: string) => {
    return slots.filter(s => s.date === date);
  };

  // Get time slot index
  const getTimeIndex = (time: string): number => {
    return TIME_SLOTS.indexOf(time as typeof TIME_SLOTS[number]);
  };

  // Track if we actually dragged (moved to different slot)
  const hasDragged = useRef(false);

  // Handle drag start
  const handleDragStart = useCallback((index: number, time: string) => {
    if (isLocked) return;
    
    const slot = slots.find(s => s.date === selectedDate && s.time === time);
    const isCurrentlyAvailable = slot?.availableUsers.includes(currentUser.id) || false;
    
    setIsDragging(true);
    setDragMode(isCurrentlyAvailable ? 'deselect' : 'select');
    dragStartIndex.current = index;
    hasDragged.current = false;
    setDraggedIndices(new Set([index]));
  }, [isLocked, slots, selectedDate, currentUser.id]);

  // Handle drag move
  const handleDragMove = useCallback((index: number) => {
    if (!isDragging || dragStartIndex.current === null) return;
    
    // Mark that we actually dragged to a different slot
    if (index !== dragStartIndex.current) {
      hasDragged.current = true;
    }
    
    const start = Math.min(dragStartIndex.current, index);
    const end = Math.max(dragStartIndex.current, index);
    const newIndices = new Set<number>();
    
    for (let i = start; i <= end; i++) {
      newIndices.add(i);
    }
    
    setDraggedIndices(newIndices);
  }, [isDragging]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    
    // If we didn't actually drag (just clicked), handle as single click
    if (!hasDragged.current && draggedIndices.size === 1) {
      const index = Array.from(draggedIndices)[0];
      const time = TIME_SLOTS[index];
      if (time) {
        const slot = slots.find(s => s.date === selectedDate && s.time === time);
        const isCurrentlyAvailable = slot?.availableUsers.includes(currentUser.id) || false;
        const conflict = getConflict(time);
        
        // For single click, toggle the slot (skip if conflict and trying to select)
        if (!(conflict && !isCurrentlyAvailable)) {
          onToggle(selectedDate, time, !isCurrentlyAvailable);
        }
      }
    } else {
      // Apply changes to all dragged slots (multi-select)
      // Use batch toggle if available for better performance
      if (onBatchToggle) {
        const updates: Array<{ date: string; time: string; isAvailable: boolean }> = [];
        draggedIndices.forEach(index => {
          const time = TIME_SLOTS[index];
          if (time) {
            const conflict = getConflict(time);
            // Skip if there's a conflict and trying to select
            if (dragMode === 'select' && conflict) return;
            updates.push({ date: selectedDate, time, isAvailable: dragMode === 'select' });
          }
        });
        if (updates.length > 0) {
          onBatchToggle(updates);
        }
      } else {
        // Fallback to individual toggles
        draggedIndices.forEach(index => {
          const time = TIME_SLOTS[index];
          if (time) {
            const conflict = getConflict(time);
            // Skip if there's a conflict and trying to select
            if (dragMode === 'select' && conflict) return;
            onToggle(selectedDate, time, dragMode === 'select');
          }
        });
      }
    }
    
    setIsDragging(false);
    setDraggedIndices(new Set());
    dragStartIndex.current = null;
    hasDragged.current = false;
  }, [isDragging, draggedIndices, dragMode, selectedDate, onToggle, onBatchToggle, slots, currentUser.id]);

  // Handle select all for current date
  const handleSelectAll = () => {
    if (isLocked) return;
    
    if (onBatchToggle) {
      const updates: Array<{ date: string; time: string; isAvailable: boolean }> = [];
      TIME_SLOTS.forEach(time => {
        const slot = slots.find(s => s.date === selectedDate && s.time === time);
        const isAvailable = slot?.availableUsers.includes(currentUser.id) || false;
        const conflict = getConflict(time);
        if (!isAvailable && !conflict) {
          updates.push({ date: selectedDate, time, isAvailable: true });
        }
      });
      if (updates.length > 0) {
        onBatchToggle(updates);
      }
    } else {
      TIME_SLOTS.forEach(time => {
        const slot = slots.find(s => s.date === selectedDate && s.time === time);
        const isAvailable = slot?.availableUsers.includes(currentUser.id) || false;
        const conflict = getConflict(time);
        if (!isAvailable && !conflict) {
          onToggle(selectedDate, time, true);
        }
      });
    }
  };

  // Handle clear all for current date
  const handleClearAll = () => {
    if (isLocked) return;
    
    if (onBatchToggle) {
      const updates: Array<{ date: string; time: string; isAvailable: boolean }> = [];
      TIME_SLOTS.forEach(time => {
        const slot = slots.find(s => s.date === selectedDate && s.time === time);
        const isAvailable = slot?.availableUsers.includes(currentUser.id) || false;
        if (isAvailable) {
          updates.push({ date: selectedDate, time, isAvailable: false });
        }
      });
      if (updates.length > 0) {
        onBatchToggle(updates);
      }
    } else {
      TIME_SLOTS.forEach(time => {
        const slot = slots.find(s => s.date === selectedDate && s.time === time);
        const isAvailable = slot?.availableUsers.includes(currentUser.id) || false;
        if (isAvailable) {
          onToggle(selectedDate, time, false);
        }
      });
    }
  };

  // Get current day's availability as a template
  const getCurrentDayAvailability = useCallback((): string[] => {
    return TIME_SLOTS.filter(time => {
      const slot = slots.find(s => s.date === selectedDate && s.time === time);
      return slot?.availableUsers.includes(currentUser.id);
    }) as string[];
  }, [slots, selectedDate, currentUser.id, TIME_SLOTS]);

  // Copy current day's availability to target dates
  const copyToTargetDates = useCallback((targetDates: string[]) => {
    if (!onBatchToggle) return;
    
    const myAvailableTimes = getCurrentDayAvailability();
    const updates: Array<{ date: string; time: string; isAvailable: boolean }> = [];
    
    for (const targetDate of targetDates) {
      if (targetDate === selectedDate) continue;
      
      for (const time of TIME_SLOTS) {
        const shouldBeAvailable = myAvailableTimes.includes(time as string);
        const slot = slots.find(s => s.date === targetDate && s.time === time);
        const isCurrentlyAvailable = slot?.availableUsers.includes(currentUser.id) || false;
        
        if (shouldBeAvailable !== isCurrentlyAvailable) {
          updates.push({ date: targetDate, time: time as string, isAvailable: shouldBeAvailable });
        }
      }
    }
    
    if (updates.length > 0) {
      onBatchToggle(updates);
    }
    setShowCopyMenu(false);
  }, [onBatchToggle, getCurrentDayAvailability, selectedDate, TIME_SLOTS, slots, currentUser.id]);

  // Copy to all same weekday (e.g., all Mondays)
  const handleCopyToSameWeekday = useCallback(() => {
    const selectedDay = parseDate(selectedDate).getDay();
    const targetDates = dates.filter(d => parseDate(d).getDay() === selectedDay);
    copyToTargetDates(targetDates);
  }, [selectedDate, dates, copyToTargetDates]);

  // Copy to all days
  const handleCopyToAllDays = useCallback(() => {
    copyToTargetDates(dates);
  }, [dates, copyToTargetDates]);

  // Copy to weekdays only (Mon-Fri)
  const handleCopyToWeekdays = useCallback(() => {
    const targetDates = dates.filter(d => {
      const day = parseDate(d).getDay();
      return day >= 1 && day <= 5;
    });
    copyToTargetDates(targetDates);
  }, [dates, copyToTargetDates]);

  // Copy to weekends only (Sat-Sun)
  const handleCopyToWeekends = useCallback(() => {
    const targetDates = dates.filter(d => {
      const day = parseDate(d).getDay();
      return day === 0 || day === 6;
    });
    copyToTargetDates(targetDates);
  }, [dates, copyToTargetDates]);

  // Count selected slots for current date
  const selectedCount = TIME_SLOTS.filter(time => {
    const slot = slots.find(s => s.date === selectedDate && s.time === time);
    return slot?.availableUsers.includes(currentUser.id);
  }).length;

  const selectedDayName = getDayOfWeek(selectedDate);
  const fullDayNames: Record<string, string> = {
    'Sun': 'Sunday', 'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday',
    'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday'
  };
  const sameWeekdayCount = dates.filter(d => getDayOfWeek(d) === selectedDayName && d !== selectedDate).length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex flex-col space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-gray-900">Availability Grid</h3>
          <div className="flex items-center space-x-2">
            {calendarEvents.length > 0 && onClearCalendar && (
              <button
                onClick={onClearCalendar}
                className="px-2 py-1 text-[9px] font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider transition-colors"
                title="Clear calendar events"
              >
                Clear
              </button>
            )}
            {isAppleCalendarConnected ? (
              <>
                <button
                  onClick={onDisconnectAppleCalendar}
                  className="px-2 py-1 text-[9px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-wider transition-colors"
                  title={`Connected: ${appleCalendarEmail || 'Apple Calendar'}`}
                >
                  ✓ Connected
                </button>
                <button 
                  onClick={onSyncCalendar}
                  disabled={isSyncing}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all bg-indigo-600 text-white hover:bg-indigo-700"
                  title="Sync from Apple Calendar"
                >
                  {isSyncing ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : <Icons.Calendar />}
                  <span>{calendarEvents.length > 0 ? `${calendarEvents.length} Events` : 'Sync Calendar'}</span>
                </button>
              </>
            ) : (
              <>
                {onConnectAppleCalendar && (
                  <button
                    onClick={onConnectAppleCalendar}
                    className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                    title="Connect Apple Calendar (iCloud)"
                  >
                    Connect Apple
                  </button>
                )}
                <button 
                  onClick={onSyncCalendar}
                  disabled={isSyncing}
                  className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all
                    ${calendarEvents.length > 0 
                      ? 'bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100' 
                      : 'bg-gray-900 text-white hover:bg-gray-800'}`}
                  title="Sync calendar (demo mode)"
                >
                  {isSyncing ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : <Icons.Calendar />}
                  <span>{calendarEvents.length > 0 ? `${calendarEvents.length} Events` : 'Sync Calendar'}</span>
                </button>
              </>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-4 text-[10px] font-bold uppercase tracking-tighter text-gray-400">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-emerald-100 rounded"></div>
            <span>Some</span>
            <div className="w-3 h-3 bg-emerald-700 rounded ml-1"></div>
            <span>All</span>
          </div>
          {calendarEvents.length > 0 && (
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-rose-100 border border-rose-300 rounded"></div>
              <span className="text-rose-500">Conflict</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Date Selector */}
      <div className="px-4 py-2 border-b border-gray-100 overflow-x-auto">
        <div className="flex space-x-2">
          {dates.map(date => {
            const isSelected = date === selectedDate;
            const daySlots = getSlotsForDate(date);
            const myFilledCount = daySlots.filter(s => s.availableUsers.includes(currentUser.id)).length;
            const hasFilled = myFilledCount > 0;
            
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap relative ${
                  isSelected
                    ? 'bg-indigo-600 text-white'
                    : hasFilled
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <div className="text-center">
                  <div>{getDayOfWeek(date)}</div>
                  <div className="text-[10px]">{formatDateShort(date)}</div>
                  {isToday(date) && (
                    <div className="text-[8px] mt-0.5 opacity-80">Today</div>
                  )}
                </div>
                {hasFilled && !isSelected && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full"></div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Actions */}
      {!isLocked && (
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-gray-500">
              <span className="font-bold text-gray-700">{selectedCount}</span> / {TIME_SLOTS.length} selected
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSelectAll}
                className="px-3 py-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-full transition-colors"
              >
                Select All
              </button>
              <button
                onClick={handleClearAll}
                className="px-3 py-1 text-[10px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Copy to other days */}
          {selectedCount > 0 && dates.length > 1 && onBatchToggle && (
            <div className="relative mt-2">
              <button
                onClick={() => setShowCopyMenu(!showCopyMenu)}
                className="w-full py-2 px-3 text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors flex items-center justify-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Apply {selectedDayName}'s schedule to other days...
                <span className="text-[9px]">{showCopyMenu ? '▲' : '▼'}</span>
              </button>

              {showCopyMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowCopyMenu(false)} />
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                    {sameWeekdayCount > 0 && (
                      <button
                        onClick={handleCopyToSameWeekday}
                        className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-indigo-50 flex items-center gap-2"
                      >
                        <span className="text-base">📅</span>
                        <div>
                          <div className="font-medium">All {fullDayNames[selectedDayName]}s</div>
                          <div className="text-[10px] text-gray-400">{sameWeekdayCount} other {fullDayNames[selectedDayName]}{sameWeekdayCount > 1 ? 's' : ''}</div>
                        </div>
                      </button>
                    )}
                    <button
                      onClick={handleCopyToWeekdays}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-indigo-50 flex items-center gap-2"
                    >
                      <span className="text-base">💼</span>
                      <div>
                        <div className="font-medium">All weekdays</div>
                        <div className="text-[10px] text-gray-400">Monday - Friday</div>
                      </div>
                    </button>
                    <button
                      onClick={handleCopyToWeekends}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-indigo-50 flex items-center gap-2"
                    >
                      <span className="text-base">🌴</span>
                      <div>
                        <div className="font-medium">All weekends</div>
                        <div className="text-[10px] text-gray-400">Saturday - Sunday</div>
                      </div>
                    </button>
                    <div className="h-px bg-gray-100 my-1"></div>
                    <button
                      onClick={handleCopyToAllDays}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-indigo-50 flex items-center gap-2"
                    >
                      <span className="text-base">📋</span>
                      <div>
                        <div className="font-medium">Every single day</div>
                        <div className="text-[10px] text-gray-400">Apply to all {dates.length - 1} other days</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div 
        ref={gridRef}
        className="p-4 max-h-[400px] overflow-y-auto no-scrollbar select-none"
        onMouseLeave={handleDragEnd}
        onMouseUp={handleDragEnd}
        onTouchEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 gap-2">
          {TIME_SLOTS.map((time, index) => {
            const slot = slots.find(s => s.date === selectedDate && s.time === time) || { 
              date: selectedDate, 
              time, 
              availableUsers: [] 
            };
            const available = isUserAvailable(slot);
            const heatmapClass = getHeatmapColor(slot);
            const lockedKey = lockedSlot?.split('|');
            const isLockedSlot = lockedKey && slot.date === lockedKey[0] && slot.time === lockedKey[1];
            const conflict = getConflict(time);
            const isBeingDragged = draggedIndices.has(index);
            const wouldBeSelected = isBeingDragged && dragMode === 'select';
            const wouldBeDeselected = isBeingDragged && dragMode === 'deselect';

            return (
              <div 
                key={`${selectedDate}-${time}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleDragStart(index, time);
                }}
                onMouseEnter={() => handleDragMove(index)}
                onTouchStart={(e) => {
                  handleDragStart(index, time);
                }}
                onTouchMove={(e) => {
                  const touch = e.touches[0];
                  const element = document.elementFromPoint(touch.clientX, touch.clientY);
                  const slotElement = element?.closest('[data-slot-index]');
                  if (slotElement) {
                    const idx = parseInt(slotElement.getAttribute('data-slot-index') || '0', 10);
                    handleDragMove(idx);
                  }
                }}
                data-slot-index={index}
                className={`
                  relative flex items-center p-3 rounded-xl border transition-all duration-100 cursor-pointer
                  ${isLocked ? 'cursor-default' : 'active:scale-[0.98]'}
                  ${available && !wouldBeDeselected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-gray-100'}
                  ${isLockedSlot ? 'bg-indigo-600 border-indigo-600 text-white' : heatmapClass}
                  ${conflict && !available && !isLockedSlot ? 'bg-rose-50 border-rose-100' : ''}
                  ${wouldBeSelected && !available ? 'ring-2 ring-emerald-400 border-emerald-400 bg-emerald-50' : ''}
                  ${wouldBeDeselected && available ? 'ring-2 ring-rose-400 border-rose-400 opacity-60' : ''}
                `}
              >
                <div className="flex-1 flex flex-col">
                  <div className="flex items-center space-x-2">
                    <span className={`text-sm font-bold ${isLockedSlot ? 'text-white' : 'text-gray-900'}`}>
                      {time}
                    </span>
                    {conflict && !isLockedSlot && (
                      <span className="bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase">
                        Conflict
                      </span>
                    )}
                    {isBeingDragged && !isLockedSlot && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase ${
                        wouldBeSelected ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                      }`}>
                        {wouldBeSelected ? '+ Add' : '- Remove'}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-1">
                     <span className={`text-[10px] ${isLockedSlot ? 'text-indigo-100' : 'text-gray-500'}`}>
                      {slot.availableUsers.length} / {members.length} available
                    </span>
                  </div>

                  {/* Show who's available */}
                  {slot.availableUsers.length > 0 && !isLockedSlot && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {slot.availableUsers.map(userId => {
                        const member = members.find(m => m.id === userId);
                        const name = member?.name || userId.slice(0, 6);
                        const isMe = userId === currentUser.id;
                        return (
                          <span
                            key={userId}
                            className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                              isMe
                                ? 'bg-indigo-100 text-indigo-700 font-bold'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {isMe ? 'You' : name.split(' ')[0]}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  
                  {conflict && !isLockedSlot && (
                    <span className="text-[10px] text-rose-400 font-medium italic truncate max-w-[150px]">
                      Scheduled: {conflict.title}
                    </span>
                  )}
                </div>
                
                {available && !isLockedSlot && !wouldBeDeselected && (
                  <div className="bg-emerald-500 rounded-full p-1 shadow-sm">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}

                {isLockedSlot && (
                  <div className="bg-white/20 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    Locked
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!isLocked && (
        <div className="p-4 bg-gray-50 text-[10px] text-center text-gray-500 italic">
          Tip: Fill one day, then use "Apply schedule to other days" to copy it in bulk.
        </div>
      )}

      {/* Director Analysis Panel */}
      {canEdit && proposedTimeSlots && proposedTimeSlots.length > 0 && (
        <div className="border-t border-gray-100 p-4 bg-indigo-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-indigo-900 text-sm">Best Available Times</h4>
            {onAnalyze && (
              <button
                onClick={onAnalyze}
                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-wider"
              >
                Re-analyze
              </button>
            )}
          </div>
          
          {/* Show top slots: all-available first, then partial (>50%) */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {proposedTimeSlots
              .filter(slot => slot.availableCount > 0)
              .slice(0, 10)
              .map((slot, index) => {
                const isSelected = approvedTimeSlot?.date === slot.date && approvedTimeSlot?.time === slot.time;
                const matchingSlot = slots.find(s => s.date === slot.date && s.time === slot.time);
                const availableUserIds = matchingSlot?.availableUsers || [];
                const availableNames = availableUserIds.map(uid => {
                  const member = members.find(m => m.id === uid);
                  return member?.name || uid.slice(0, 6);
                });
                const missingMembers = members.filter(m => !availableUserIds.includes(m.id));
                
                return (
                  <button
                    key={`${slot.date}-${slot.time}-${index}`}
                    onClick={() => onSelectTimeSlot?.(slot)}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : slot.isAllAvailable
                          ? 'bg-white border-emerald-300 hover:border-emerald-500'
                          : 'bg-white border-indigo-200 hover:border-indigo-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                        {formatDateShort(slot.date)} at {slot.time}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : slot.isAllAvailable
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}>
                          {slot.availableCount}/{slot.totalMembers}
                        </span>
                        {isSelected && (
                          <span className="bg-white/20 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase">
                            Selected
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Available members */}
                    <div className="flex flex-wrap gap-1 mb-1">
                      {availableNames.map((name, i) => (
                        <span
                          key={i}
                          className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          ✓ {name.split(' ')[0]}
                        </span>
                      ))}
                    </div>
                    
                    {/* Missing members */}
                    {missingMembers.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {missingMembers.map(m => (
                          <span
                            key={m.id}
                            className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                              isSelected
                                ? 'bg-white/10 text-indigo-200'
                                : 'bg-rose-50 text-rose-500'
                            }`}
                          >
                            ✗ {m.name.split(' ')[0]}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            
            {proposedTimeSlots.filter(slot => slot.availableCount > 0).length === 0 && (
              <div className="text-center py-4 text-gray-500 text-xs">
                No availability data yet. Wait for members to fill in their times.
              </div>
            )}
          </div>

          {approvedTimeSlot && onSendForApproval && (
            <button
              onClick={onSendForApproval}
              className="w-full mt-3 bg-indigo-600 text-white py-2 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors"
            >
              Send to Chat for Approval
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default AvailabilityGrid;
