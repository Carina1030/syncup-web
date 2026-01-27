
import React, { useState } from 'react';
import { TIME_SLOTS, Icons } from '../constants';
import { AvailabilitySlot, User, CalendarEvent } from '../types';

interface AvailabilityGridProps {
  slots: AvailabilitySlot[];
  currentUser: User;
  members: User[];
  onToggle: (time: string, isAvailable: boolean) => void;
  isLocked: boolean;
  lockedSlot?: string;
  calendarEvents: CalendarEvent[];
  isSyncing: boolean;
  onSyncCalendar: () => void;
}

const AvailabilityGrid: React.FC<AvailabilityGridProps> = ({ 
  slots, 
  currentUser, 
  members, 
  onToggle,
  isLocked,
  lockedSlot,
  calendarEvents,
  isSyncing,
  onSyncCalendar
}) => {
  const getHeatmapColor = (slot: AvailabilitySlot) => {
    if (isLocked) {
      return slot.time === lockedSlot ? 'bg-indigo-600' : 'bg-gray-100';
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

  const handleSlotClick = (time: string) => {
    if (isLocked) return;
    const slot = slots.find(s => s.time === time);
    const currentlyAvailable = slot?.availableUsers.includes(currentUser.id) || false;
    onToggle(time, !currentlyAvailable);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex flex-col space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-gray-900">Availability Grid</h3>
          <button 
            onClick={onSyncCalendar}
            disabled={isSyncing}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all
              ${calendarEvents.length > 0 
                ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' 
                : 'bg-gray-900 text-white'}`}
          >
            {isSyncing ? (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : <Icons.Calendar />}
            <span>{calendarEvents.length > 0 ? 'Calendar Synced' : 'Sync Calendar'}</span>
          </button>
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
      
      <div className="p-4 max-h-[400px] overflow-y-auto no-scrollbar">
        <div className="grid grid-cols-1 gap-2">
          {TIME_SLOTS.map((time) => {
            const slot = slots.find(s => s.time === time) || { time, availableUsers: [] };
            const available = isUserAvailable(slot);
            const heatmapClass = getHeatmapColor(slot);
            const isLockedSlot = lockedSlot === time;
            const conflict = getConflict(time);

            return (
              <div 
                key={time}
                onClick={() => handleSlotClick(time)}
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
          Tip: Tap slots to toggle. Red markers indicate your existing calendar conflicts.
        </div>
      )}
    </div>
  );
};

export default AvailabilityGrid;
