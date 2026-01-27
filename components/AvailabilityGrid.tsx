
import React, { useState } from 'react';
import { TIME_SLOTS, Icons } from '../constants';
import { AvailabilitySlot, User, CalendarEvent, DateRange, ProposedTimeSlot } from '../types';
import { getDatesInRange, formatDateShort, getDayOfWeek, isToday } from '../utils/dateUtils';

interface AvailabilityGridProps {
  slots: AvailabilitySlot[];
  currentUser: User;
  members: User[];
  dateRange: DateRange;
  onToggle: (date: string, time: string, isAvailable: boolean) => void;
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
  onToggle,
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

  const dates = getDatesInRange(dateRange.startDate, dateRange.endDate);

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
    if (isLocked) return;
    const slot = slots.find(s => s.date === date && s.time === time);
    const currentlyAvailable = slot?.availableUsers.includes(currentUser.id) || false;
    onToggle(date, time, !currentlyAvailable);
  };

  const getSlotsForDate = (date: string) => {
    return slots.filter(s => s.date === date);
  };

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
            const totalAvailable = daySlots.reduce((sum, s) => sum + s.availableUsers.length, 0);
            
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  isSelected
                    ? 'bg-indigo-600 text-white'
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
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 max-h-[400px] overflow-y-auto no-scrollbar">
        <div className="grid grid-cols-1 gap-2">
          {TIME_SLOTS.map((time) => {
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

            return (
              <div 
                key={`${selectedDate}-${time}`}
                onClick={() => handleSlotClick(selectedDate, time)}
                className={`
                  relative flex items-center p-3 rounded-xl border transition-all duration-200 cursor-pointer
                  ${isLocked ? 'cursor-default' : 'active:scale-95'}
                  ${available ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-gray-100'}
                  ${isLockedSlot ? 'bg-indigo-600 border-indigo-600 text-white' : heatmapClass}
                  ${conflict && !available && !isLockedSlot ? 'bg-rose-50 border-rose-100' : ''}
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
                  </div>
                  
                  <div className="flex items-center space-x-1">
                     <span className={`text-[10px] ${isLockedSlot ? 'text-indigo-100' : 'text-gray-500'}`}>
                      {slot.availableUsers.length} / {members.length} available
                    </span>
                  </div>
                  
                  {conflict && !isLockedSlot && (
                    <span className="text-[10px] text-rose-400 font-medium italic truncate max-w-[150px]">
                      Scheduled: {conflict.title}
                    </span>
                  )}
                </div>
                
                {available && !isLockedSlot && (
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
          Tip: Select a date above, then tap time slots to toggle your availability. Red markers indicate calendar conflicts.
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
          
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {proposedTimeSlots
              .filter(slot => slot.isAllAvailable)
              .slice(0, 5)
              .map((slot, index) => {
                const isSelected = approvedTimeSlot?.date === slot.date && approvedTimeSlot?.time === slot.time;
                return (
                  <button
                    key={`${slot.date}-${slot.time}-${index}`}
                    onClick={() => onSelectTimeSlot?.(slot)}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-indigo-200 hover:border-indigo-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={`font-bold ${isSelected ? 'text-white' : 'text-indigo-900'}`}>
                          {formatDateShort(slot.date)} at {slot.time}
                        </div>
                        <div className={`text-[10px] ${isSelected ? 'text-indigo-100' : 'text-indigo-600'}`}>
                          ✓ All {slot.totalMembers} members available
                        </div>
                      </div>
                      {isSelected && (
                        <div className="bg-white/20 rounded-full px-2 py-1 text-[10px] font-bold uppercase">
                          Selected
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            
            {proposedTimeSlots.filter(slot => slot.isAllAvailable).length === 0 && (
              <div className="text-center py-4 text-gray-500 text-xs">
                No time slots where all members are available. Try analyzing again after more members vote.
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
