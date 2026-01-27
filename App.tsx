
import React, { useState } from 'react';
import { User, EventData, Message, AvailabilitySlot, CalendarEvent, ProposedTimeSlot, Logistics } from './types';
import { TIME_SLOTS, Icons } from './constants';
import AvailabilityGrid from './components/AvailabilityGrid';
import LogisticsHub from './components/LogisticsHub';
import ChatRoom from './components/ChatRoom';
import { parseLogisticsFromChat } from './services/geminiService';
import { fetchUserCalendar, checkAppleCalendarAuth, authenticateAppleCalendar, disconnectAppleCalendar } from './services/calendarService';
import { getDatesInRange, formatDateShort } from './utils/dateUtils';
import { analyzeAvailability } from './utils/availabilityAnalysis';

const App: React.FC = () => {
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showCalendarForm, setShowCalendarForm] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [isAppleCalendarConnected, setIsAppleCalendarConnected] = useState(false);
  const [appleCalendarEmail, setAppleCalendarEmail] = useState<string | null>(null);
  const [useRealCalendar, setUseRealCalendar] = useState(false);
  const [showAppleCalendarForm, setShowAppleCalendarForm] = useState(false);
  
  // Initialize with empty state - user will create event
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);

  const [activeTab, setActiveTab] = useState<'grid' | 'logistics' | 'chat'>('grid');

  // Create new event
  const handleCreateEvent = (eventData: { 
    title: string; 
    description: string; 
    creatorName: string; 
    creatorRole: 'Director' | 'Co-manager' | 'Member';
    startDate: string;
    endDate: string;
  }) => {
    const creatorId = Math.random().toString(36).substr(2, 9);
    const creator: User = { id: creatorId, name: eventData.creatorName, role: eventData.creatorRole };
    
    // Generate slots for all dates in range
    const dates = getDatesInRange(eventData.startDate, eventData.endDate);
    const slots: AvailabilitySlot[] = [];
    
    dates.forEach((date: string) => {
      TIME_SLOTS.forEach((time: string) => {
        slots.push({
          date,
          time,
          availableUsers: []
        });
      });
    });
    
    const newEvent: EventData = {
      id: Math.random().toString(36).substr(2, 9),
      title: eventData.title,
      description: eventData.description,
      creatorId: creatorId,
      logistics: {
        venue: '',
        wardrobe: '',
        materials: '',
        notes: ''
      },
      dateRange: {
        startDate: eventData.startDate,
        endDate: eventData.endDate
      },
      slots,
      messages: [
        {
          id: `sys-${Date.now()}`,
          userId: 'system',
          userName: 'SyncUp',
          text: `${eventData.creatorName} created the event (${eventData.startDate} to ${eventData.endDate})`,
          timestamp: Date.now(),
          isSystem: true
        }
      ],
      members: [creator],
      isLocked: false
    };
    
    setEvent(newEvent);
    setCurrentUser(creator);
  };

  // Add member
  const handleAddMember = (memberData: { name: string; role: 'Director' | 'Co-manager' | 'Member' }) => {
    if (!event) return;
    const newMember: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: memberData.name,
      role: memberData.role
    };
    
    setEvent((prev: EventData | null) => {
      if (!prev) return null;
      return {
        ...prev,
        members: [...prev.members, newMember],
        messages: [
          ...prev.messages,
          {
            id: `sys-member-${Date.now()}`,
            userId: 'system',
            userName: 'SyncUp',
            text: `${memberData.name} joined the event`,
            timestamp: Date.now(),
            isSystem: true
          }
        ]
      };
    });
    setShowMemberForm(false);
  };

  // Add calendar event
  const handleAddCalendarEvent = (eventData: { title: string; startTime: string; durationMinutes: number }) => {
    const newEvent: CalendarEvent = {
      id: Math.random().toString(36).substr(2, 9),
      title: eventData.title,
      startTime: eventData.startTime,
      durationMinutes: eventData.durationMinutes
    };
    setCalendarEvents((prev: CalendarEvent[]) => [...prev, newEvent]);
    setShowCalendarForm(false);
  };

  // Remove calendar event
  const handleRemoveCalendarEvent = (eventId: string) => {
    setCalendarEvents((prev: CalendarEvent[]) => prev.filter((e: CalendarEvent) => e.id !== eventId));
  };

  // Check Apple Calendar connection status on mount
  React.useEffect(() => {
    const checkConnection = async () => {
      const connected = checkAppleCalendarAuth();
      setIsAppleCalendarConnected(connected);
      if (connected) {
        // Get stored email from credentials if available
        const { getCalDAVCredentials } = await import('./services/appleCalendarAuth');
        const credentials = getCalDAVCredentials();
        if (credentials) {
          setAppleCalendarEmail(credentials.username);
          setUseRealCalendar(true);
        }
      }
    };
    checkConnection();
  }, []);

  // Handle Apple Calendar authentication
  const handleConnectAppleCalendar = async (username: string, password: string, serverUrl?: string) => {
    try {
      const success = await authenticateAppleCalendar(username, password, serverUrl);
      if (success) {
        setIsAppleCalendarConnected(true);
        setAppleCalendarEmail(username);
        setUseRealCalendar(true);
        setShowAppleCalendarForm(false);
      } else {
        alert('Failed to connect to Apple Calendar. Please check your credentials.');
      }
    } catch (error) {
      console.error('Error connecting to Apple Calendar:', error);
      alert('Failed to connect to Apple Calendar. Please check your credentials and ensure you\'re using an app-specific password.');
    }
  };

  // Handle Apple Calendar disconnect
  const handleDisconnectAppleCalendar = async () => {
    try {
      await disconnectAppleCalendar();
      setIsAppleCalendarConnected(false);
      setAppleCalendarEmail(null);
      setUseRealCalendar(false);
      setCalendarEvents([]);
    } catch (error) {
      console.error('Error disconnecting Apple Calendar:', error);
    }
  };

  // Logic: Sync Calendar
  const handleSyncCalendar = async () => {
    setIsSyncingCalendar(true);
    try {
      // Use real calendar if connected, otherwise use demo data
      const data = await fetchUserCalendar(useRealCalendar, !useRealCalendar);
      
      // Only add events that don't already exist (by time slot)
      setCalendarEvents((prev: CalendarEvent[]) => {
        const existingTimes = new Set(prev.map((e: CalendarEvent) => e.startTime));
        const newEvents = data.filter((e: CalendarEvent) => !existingTimes.has(e.startTime));
        return [...prev, ...newEvents];
      });
    } catch (err) {
      console.error("Failed to sync calendar", err);
      alert("Failed to sync calendar. Please try again.");
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  // Logic: Handle message sending and AI parsing
  const handleSendMessage = async (text: string) => {
    if (!event || !currentUser) return;
    
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      userId: currentUser.id,
      userName: currentUser.name,
      text,
      timestamp: Date.now()
    };

    setEvent((prev: EventData | null) => {
      if (!prev) return null;
      return {
        ...prev,
        messages: [...prev.messages, newMessage]
      };
    });

    // AI Parsing for Directors/Co-managers
    if (currentUser.role === 'Director' || currentUser.role === 'Co-manager') {
      const updates = await parseLogisticsFromChat(text, event.logistics);
      if (updates) {
        setEvent((prev: EventData | null) => {
          if (!prev) return null;
          return {
            ...prev,
            logistics: { ...prev.logistics, ...updates, lastUpdatedBy: currentUser.name },
            messages: [
              ...prev.messages,
              { 
                id: `sys-${Date.now()}`, 
                userId: 'system', 
                userName: 'SyncUp', 
                text: `AI: Logistics updated by ${currentUser.name}`, 
                timestamp: Date.now(), 
                isSystem: true 
              }
            ]
          };
        });
      }
    }
  };

  const handleToggleAvailability = (date: string, time: string, isAvailable: boolean) => {
    if (!event || !currentUser) return;
    
    // Conflict Prevention: If trying to mark as available, check calendar events first
    if (isAvailable) {
      const conflict = calendarEvents.find((e: CalendarEvent) => e.startTime === time);
      if (conflict) {
        alert(`Conflict detected: "${conflict.title}". You cannot mark yourself as available during your existing calendar events.`);
        return;
      }
    }

    setEvent((prev: EventData | null) => {
      if (!prev) return null;
      return {
        ...prev,
        slots: prev.slots.map((slot: AvailabilitySlot) => {
          if (slot.date === date && slot.time === time) {
            const newUserList = isAvailable 
              ? [...slot.availableUsers, currentUser.id]
              : slot.availableUsers.filter((id: string) => id !== currentUser.id);
            return { ...slot, availableUsers: newUserList };
          }
          return slot;
        })
      };
    });
  };

  // Analyze availability and generate proposed time slots
  const handleAnalyzeAvailability = () => {
    if (!event) return;
    
    const proposedSlots = analyzeAvailability(event.slots, event.members, event.dateRange);
    
    setEvent((prev: EventData | null) => {
      if (!prev) return null;
      return {
        ...prev,
        proposedTimeSlots: proposedSlots
      };
    });
  };

  // Director selects a time slot for approval
  const handleSelectTimeSlot = (slot: ProposedTimeSlot) => {
    if (!event || !currentUser) return;
    
    setEvent((prev: EventData | null) => {
      if (!prev) return null;
      return {
        ...prev,
        approvedTimeSlot: slot
      };
    });
  };

  // Send approved time slot to chat for member approval
  const handleSendTimeSlotForApproval = () => {
    if (!event || !currentUser || !event.approvedTimeSlot) return;
    
    const timeSlotText = `${formatDateShort(event.approvedTimeSlot.date)} at ${event.approvedTimeSlot.time}`;
    
    const message: Message = {
      id: Math.random().toString(36).substr(2, 9),
      userId: currentUser.id,
      userName: currentUser.name,
      text: `📅 Proposed Time: ${timeSlotText}\n\nPlease confirm if this time works for you! 👍`,
      timestamp: Date.now()
    };

    setEvent((prev: EventData | null) => {
      if (!prev) return null;
      return {
        ...prev,
        messages: [...prev.messages, message]
      };
    });

    // Switch to chat tab
    setActiveTab('chat');
  };

  const handleLockEvent = (date: string, time: string) => {
    if (!event || !currentUser) return;
    const lockedKey = `${date}|${time}`;
    setEvent((prev: EventData | null) => {
      if (!prev) return null;
      return {
        ...prev,
        isLocked: true,
        lockedSlot: lockedKey,
        messages: [
          ...prev.messages,
          {
            id: `sys-lock-${Date.now()}`,
            userId: 'system',
            userName: 'SyncUp',
            text: `Event locked for ${date} at ${time}`,
            timestamp: Date.now(),
            isSystem: true
          }
        ]
      };
    });
  };

  const handleUnlockEvent = () => {
    if (!event || !currentUser) return;
    setEvent((prev: EventData | null) => {
      if (!prev) return null;
      return {
        ...prev,
        isLocked: false,
        lockedSlot: undefined,
        messages: [
          ...prev.messages,
          {
            id: `sys-unlock-${Date.now()}`,
            userId: 'system',
            userName: 'SyncUp',
            text: `Event unlocked by ${currentUser.name}`,
            timestamp: Date.now(),
            isSystem: true
          }
        ]
      };
    });
  };

  const canEdit = !!(currentUser && (currentUser.role === 'Director' || currentUser.role === 'Co-manager'));

  // Show event creation form if no event exists
  if (!event || !currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative shadow-2xl overflow-hidden">
        <header className="bg-white border-b border-gray-100 p-6">
          <h1 className="text-2xl font-black text-indigo-600 tracking-tighter">SyncUp</h1>
          <p className="text-gray-600 text-sm mt-2">Create your first event</p>
        </header>
        
        <main className="flex-1 p-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-bold text-gray-900 mb-4">Create New Event</h2>
            <EventCreationForm onSubmit={handleCreateEvent} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative shadow-2xl overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 p-6 sticky top-0 z-30">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-indigo-600 tracking-tighter">SyncUp</h1>
            <p className="text-gray-900 font-bold text-lg mt-1">{event.title}</p>
          </div>
          <div className="flex flex-col items-end">
             <div className="bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 flex items-center space-x-2">
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest">{currentUser.role}</span>
             </div>
             <button 
              onClick={() => {
                if (!event || !currentUser) return;
                const currentIndex = event.members.findIndex((m: User) => m.id === currentUser.id);
                if (currentIndex === -1) return;
                const nextIndex = (currentIndex + 1) % event.members.length;
                setCurrentUser(event.members[nextIndex]);
                setCalendarEvents([]); // Clear calendar on user switch
              }}
              className="text-[9px] text-gray-400 mt-2 underline"
             >
               Switch User
             </button>
          </div>
        </div>
        
        {event.isLocked && (
          <div className="mt-4 bg-indigo-600 text-white px-4 py-3 rounded-xl flex items-center justify-between shadow-lg shadow-indigo-200">
            <div className="flex items-center space-x-2">
              <Icons.Lock />
              <span className="font-bold">Finalized: {event.lockedSlot}</span>
            </div>
            {canEdit && (
              <button 
                onClick={handleUnlockEvent}
                className="text-xs bg-white/20 px-3 py-1 rounded-lg hover:bg-white/30 transition-colors"
              >
                Unlock
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 pb-32 overflow-y-auto no-scrollbar">
        {/* Member Management Button */}
        {canEdit && (
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setShowMemberForm(true)}
              className="flex-1 bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              + Add Member
            </button>
            <button
              onClick={() => setShowCalendarForm(true)}
              className="flex-1 bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              + Add Calendar Event
            </button>
          </div>
        )}

        {/* Calendar Events List */}
        {calendarEvents.length > 0 && (
          <div className="mb-4 bg-white rounded-xl border border-gray-100 p-3">
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Your Calendar Events</h4>
            <div className="space-y-1">
              {calendarEvents.map((calEvent: CalendarEvent) => (
                <div key={calEvent.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-lg">
                  <span className="text-gray-700">{calEvent.title} - {calEvent.startTime}</span>
                  <button
                    onClick={() => handleRemoveCalendarEvent(calEvent.id)}
                    className="text-rose-500 hover:text-rose-700"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'grid' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            {canEdit && !event.isLocked && event.slots.some((s: AvailabilitySlot) => s.availableUsers.length > 0) && (
              <div className="mb-4 p-4 bg-white border border-gray-100 rounded-2xl">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-gray-900">Director's Tools</h4>
                  <button
                    onClick={handleAnalyzeAvailability}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors"
                  >
                    Analyze Availability
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Click "Analyze Availability" to find time slots where all members are available.
                </p>
              </div>
            )}
            
            <AvailabilityGrid 
              slots={event.slots} 
              currentUser={currentUser} 
              members={event.members}
              dateRange={event.dateRange}
              onToggle={handleToggleAvailability}
              isLocked={event.isLocked}
              lockedSlot={event.lockedSlot}
              calendarEvents={calendarEvents}
              isSyncing={isSyncingCalendar}
              onSyncCalendar={handleSyncCalendar}
              onClearCalendar={() => setCalendarEvents([])}
              isAppleCalendarConnected={isAppleCalendarConnected}
              appleCalendarEmail={appleCalendarEmail}
              onConnectAppleCalendar={() => setShowAppleCalendarForm(true)}
              onDisconnectAppleCalendar={handleDisconnectAppleCalendar}
              proposedTimeSlots={event.proposedTimeSlots}
              approvedTimeSlot={event.approvedTimeSlot}
              onAnalyze={handleAnalyzeAvailability}
              onSelectTimeSlot={handleSelectTimeSlot}
              onSendForApproval={handleSendTimeSlotForApproval}
              canEdit={canEdit}
            />
          </div>
        )}

        {activeTab === 'logistics' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <LogisticsHub 
              logistics={event.logistics} 
              isEditor={canEdit}
              onUpdate={(updates: Partial<Logistics>) => setEvent((prev: EventData | null) => {
                if (!prev) return null;
                return { ...prev, logistics: { ...prev.logistics, ...updates } };
              })}
            />
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <ChatRoom 
              messages={event.messages} 
              currentUser={currentUser} 
              onSendMessage={handleSendMessage}
            />
          </div>
        )}
      </main>

      {/* Member Form Modal */}
      {showMemberForm && (
        <MemberFormModal
          onClose={() => setShowMemberForm(false)}
          onSubmit={handleAddMember}
        />
      )}

      {/* Calendar Event Form Modal */}
      {showCalendarForm && (
        <CalendarEventFormModal
          onClose={() => setShowCalendarForm(false)}
          onSubmit={handleAddCalendarEvent}
        />
      )}

      {/* Apple Calendar Connection Form Modal */}
      {showAppleCalendarForm && (
        <AppleCalendarFormModal
          onClose={() => setShowAppleCalendarForm(false)}
          onSubmit={handleConnectAppleCalendar}
        />
      )}

      {/* Navigation - Sticky Bottom */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/80 backdrop-blur-md border-t border-gray-100 p-4 pb-8 z-40">
        <div className="flex justify-around items-center bg-gray-900 rounded-3xl p-2 shadow-2xl">
          <button 
            onClick={() => setActiveTab('grid')}
            className={`flex-1 flex flex-col items-center py-2 rounded-2xl transition-all ${activeTab === 'grid' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400'}`}
          >
            <Icons.Grid />
            <span className="text-[10px] font-bold uppercase mt-1">Voting</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('logistics')}
            className={`flex-1 flex flex-col items-center py-2 rounded-2xl transition-all ${activeTab === 'logistics' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400'}`}
          >
            <Icons.Map />
            <span className="text-[10px] font-bold uppercase mt-1">Hub</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('chat')}
            className={`flex-1 flex flex-col items-center py-2 rounded-2xl transition-all ${activeTab === 'chat' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400'}`}
          >
            <div className="relative">
              <Icons.Chat />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full border-2 border-gray-900"></div>
            </div>
            <span className="text-[10px] font-bold uppercase mt-1">Chat</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

// Event Creation Form Component
const EventCreationForm: React.FC<{
  onSubmit: (data: { title: string; description: string; creatorName: string; creatorRole: 'Director' | 'Co-manager' | 'Member'; startDate: string; endDate: string }) => void;
}> = ({ onSubmit }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [creatorRole, setCreatorRole] = useState<'Director' | 'Co-manager' | 'Member'>('Director');
  
  // Default to next week
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  
  const getFormattedDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState(getFormattedDate(today));
  const [endDate, setEndDate] = useState(getFormattedDate(nextWeek));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || !creatorName.trim()) return;
    if (startDate > endDate) {
      alert('End date must be after start date');
      return;
    }
    onSubmit({ title, description, creatorName, creatorRole, startDate, endDate });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Event Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Jazz Rehearsal"
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          required
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
        <textarea
          value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
          placeholder="Event description..."
          rows={3}
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Your Name</label>
        <input
          type="text"
          value={creatorName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreatorName(e.target.value)}
          placeholder="Enter your name"
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          required
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Your Role</label>
        <select
          value={creatorRole}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCreatorRole(e.target.value as 'Director' | 'Co-manager' | 'Member')}
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        >
          <option value="Director">Director</option>
          <option value="Co-manager">Co-manager</option>
          <option value="Member">Member</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Availability Date Range</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 mb-1 block">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)}
              min={getFormattedDate(today)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 mb-1 block">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)}
              min={startDate}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">
          Members will select their availability within this date range
        </p>
      </div>
      <button
        type="submit"
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
      >
        Create Event
      </button>
    </form>
  );
};

// Member Form Modal Component
const MemberFormModal: React.FC<{
  onClose: () => void;
  onSubmit: (data: { name: string; role: 'Director' | 'Co-manager' | 'Member' }) => void;
}> = ({ onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'Director' | 'Co-manager' | 'Member'>('Member');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name, role });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full">
        <h3 className="font-bold text-gray-900 mb-4">Add Member</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="Member name"
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role</label>
            <select
              value={role}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRole(e.target.value as 'Director' | 'Co-manager' | 'Member')}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            >
              <option value="Director">Director</option>
              <option value="Co-manager">Co-manager</option>
              <option value="Member">Member</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Calendar Event Form Modal Component
const CalendarEventFormModal: React.FC<{
  onClose: () => void;
  onSubmit: (data: { title: string; startTime: string; durationMinutes: number }) => void;
}> = ({ onClose, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || !startTime) return;
    onSubmit({ title, startTime, durationMinutes });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full">
        <h3 className="font-bold text-gray-900 mb-4">Add Calendar Event</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Event Title</label>
            <input
              type="text"
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              placeholder="e.g., Dentist Appointment"
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Start Time</label>
            <select
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            >
              <option value="">Select time</option>
              {TIME_SLOTS.map(time => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Duration (minutes)</label>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDurationMinutes(parseInt(e.target.value) || 60)}
              min={15}
              step={15}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Apple Calendar Connection Form Modal Component
const AppleCalendarFormModal: React.FC<{
  onClose: () => void;
  onSubmit: (username: string, password: string, serverUrl?: string) => void;
}> = ({ onClose, onSubmit }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [useCustomServer, setUseCustomServer] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    const finalServerUrl = useCustomServer && serverUrl.trim() ? serverUrl.trim() : undefined;
    onSubmit(username, password, finalServerUrl);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-gray-900 mb-2">Connect Apple Calendar</h3>
        <p className="text-xs text-gray-500 mb-4">
          Connect to your iCloud Calendar using your Apple ID and an app-specific password.
        </p>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-xs text-blue-800 font-semibold mb-1">Setup Instructions:</p>
          <ol className="text-xs text-blue-700 list-decimal list-inside space-y-1">
            <li>Enable Two-Factor Authentication on your Apple ID</li>
            <li>Go to appleid.apple.com → Security → App-Specific Passwords</li>
            <li>Generate a password named "SyncUp Calendar"</li>
            <li>Use your Apple ID email and the generated password below</li>
          </ol>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Apple ID Email</label>
            <input
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your.email@icloud.com"
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">App-Specific Password</label>
            <input
              type="password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Not your regular Apple ID password. Generate one at appleid.apple.com
            </p>
          </div>

          <div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomServer}
                onChange={(e) => setUseCustomServer(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs font-bold text-gray-500 uppercase">Use Custom CalDAV Server</span>
            </label>
            {useCustomServer && (
              <input
                type="text"
                value={serverUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setServerUrl(e.target.value)}
                placeholder="https://caldav.example.com"
                className="w-full mt-2 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default App;
