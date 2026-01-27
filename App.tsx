
import React, { useState, useEffect } from 'react';
import { User, EventData, Logistics, Message, AvailabilitySlot, CalendarEvent } from './types';
import { TIME_SLOTS, Icons } from './constants';
import AvailabilityGrid from './components/AvailabilityGrid';
import LogisticsHub from './components/LogisticsHub';
import ChatRoom from './components/ChatRoom';
import { parseLogisticsFromChat } from './services/geminiService';
import { fetchUserCalendar } from './services/calendarService';

const App: React.FC = () => {
  const [showEventForm, setShowEventForm] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showCalendarForm, setShowCalendarForm] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  
  // Initialize with empty state - user will create event
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);

  const [activeTab, setActiveTab] = useState<'grid' | 'logistics' | 'chat'>('grid');

  // Create new event
  const handleCreateEvent = (eventData: { title: string; description: string; creatorName: string; creatorRole: 'Director' | 'Co-manager' | 'Member' }) => {
    const creatorId = Math.random().toString(36).substr(2, 9);
    const creator: User = { id: creatorId, name: eventData.creatorName, role: eventData.creatorRole };
    
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
      slots: TIME_SLOTS.map(time => ({ time, availableUsers: [] })),
      messages: [
        {
          id: `sys-${Date.now()}`,
          userId: 'system',
          userName: 'SyncUp',
          text: `${eventData.creatorName} created the event`,
          timestamp: Date.now(),
          isSystem: true
        }
      ],
      members: [creator],
      isLocked: false
    };
    
    setEvent(newEvent);
    setCurrentUser(creator);
    setShowEventForm(false);
  };

  // Add member
  const handleAddMember = (memberData: { name: string; role: 'Director' | 'Co-manager' | 'Member' }) => {
    if (!event) return;
    const newMember: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: memberData.name,
      role: memberData.role
    };
    
    setEvent(prev => prev ? {
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
    } : null);
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
    setCalendarEvents(prev => [...prev, newEvent]);
    setShowCalendarForm(false);
  };

  // Remove calendar event
  const handleRemoveCalendarEvent = (eventId: string) => {
    setCalendarEvents(prev => prev.filter(e => e.id !== eventId));
  };

  // Logic: Sync Calendar
  const handleSyncCalendar = async () => {
    setIsSyncingCalendar(true);
    try {
      const data = await fetchUserCalendar();
      setCalendarEvents(prev => [...prev, ...data]);
    } catch (err) {
      console.error("Failed to sync calendar", err);
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

    setEvent(prev => prev ? {
      ...prev,
      messages: [...prev.messages, newMessage]
    } : null);

    // AI Parsing for Directors/Co-managers
    if (currentUser.role === 'Director' || currentUser.role === 'Co-manager') {
      const updates = await parseLogisticsFromChat(text, event.logistics);
      if (updates) {
        setEvent(prev => prev ? {
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
        } : null);
      }
    }
  };

  const handleToggleAvailability = (time: string, isAvailable: boolean) => {
    if (!event || !currentUser) return;
    
    // Conflict Prevention: If trying to mark as available, check calendar events first
    if (isAvailable) {
      const conflict = calendarEvents.find(e => e.startTime === time);
      if (conflict) {
        alert(`Conflict detected: "${conflict.title}". You cannot mark yourself as available during your existing calendar events.`);
        return;
      }
    }

    setEvent(prev => prev ? {
      ...prev,
      slots: prev.slots.map(slot => {
        if (slot.time === time) {
          const newUserList = isAvailable 
            ? [...slot.availableUsers, currentUser.id]
            : slot.availableUsers.filter(id => id !== currentUser.id);
          return { ...slot, availableUsers: newUserList };
        }
        return slot;
      })
    } : null);
  };

  const handleLockEvent = (time: string) => {
    if (!event || !currentUser) return;
    setEvent(prev => prev ? {
      ...prev,
      isLocked: true,
      lockedSlot: time,
      messages: [
        ...prev.messages,
        {
          id: `sys-lock-${Date.now()}`,
          userId: 'system',
          userName: 'SyncUp',
          text: `Event locked for ${time}`,
          timestamp: Date.now(),
          isSystem: true
        }
      ]
    } : null);
  };

  const handleUnlockEvent = () => {
    if (!event || !currentUser) return;
    setEvent(prev => prev ? {
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
    } : null);
  };

  const canEdit = currentUser && (currentUser.role === 'Director' || currentUser.role === 'Co-manager');

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
                const currentIndex = event.members.findIndex(m => m.id === currentUser.id);
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
              {calendarEvents.map(calEvent => (
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
            <AvailabilityGrid 
              slots={event.slots} 
              currentUser={currentUser} 
              members={event.members}
              onToggle={handleToggleAvailability}
              isLocked={event.isLocked}
              lockedSlot={event.lockedSlot}
              calendarEvents={calendarEvents}
              isSyncing={isSyncingCalendar}
              onSyncCalendar={handleSyncCalendar}
            />
            {canEdit && !event.isLocked && (
              <div className="mt-6 p-4 bg-white border border-gray-100 rounded-2xl">
                <div className="flex items-center justify-between mb-4">
                   <h4 className="font-bold text-gray-900">Director's Dashboard</h4>
                   <span className="text-[10px] font-bold text-emerald-500 uppercase">Live Stats</span>
                </div>
                <div className="space-y-2">
                  {event.slots
                    .filter(s => s.availableUsers.length > 0)
                    .sort((a, b) => b.availableUsers.length - a.availableUsers.length)
                    .slice(0, 3)
                    .map(slot => (
                      <button 
                        key={slot.time}
                        onClick={() => handleLockEvent(slot.time)}
                        className="w-full text-left p-4 rounded-xl bg-indigo-50 border border-indigo-100 flex justify-between items-center group active:scale-[0.98] transition-all"
                      >
                        <div>
                          <span className="font-bold text-indigo-900 group-hover:text-indigo-600">{slot.time}</span>
                          <div className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">
                            {slot.availableUsers.length} / {event.members.length} Confirmed
                          </div>
                        </div>
                        <div className="p-2 bg-white rounded-full text-indigo-600 shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <Icons.Lock />
                        </div>
                      </button>
                    ))
                  }
                  {event.slots.every(s => s.availableUsers.length === 0) && (
                    <div className="p-8 border-2 border-dashed border-gray-100 rounded-2xl text-center">
                       <p className="text-xs text-gray-400">Waiting for first votes...</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logistics' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <LogisticsHub 
              logistics={event.logistics} 
              isEditor={canEdit}
              onUpdate={(updates) => setEvent(prev => prev ? ({ ...prev, logistics: { ...prev.logistics, ...updates } }) : null)}
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
  onSubmit: (data: { title: string; description: string; creatorName: string; creatorRole: 'Director' | 'Co-manager' | 'Member' }) => void;
}> = ({ onSubmit }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [creatorRole, setCreatorRole] = useState<'Director' | 'Co-manager' | 'Member'>('Director');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !creatorName.trim()) return;
    onSubmit({ title, description, creatorName, creatorRole });
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
          onChange={(e) => setDescription(e.target.value)}
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
          onChange={(e) => setCreatorName(e.target.value)}
          placeholder="Enter your name"
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          required
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Your Role</label>
        <select
          value={creatorRole}
          onChange={(e) => setCreatorRole(e.target.value as 'Director' | 'Co-manager' | 'Member')}
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        >
          <option value="Director">Director</option>
          <option value="Co-manager">Co-manager</option>
          <option value="Member">Member</option>
        </select>
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

  const handleSubmit = (e: React.FormEvent) => {
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
              onChange={(e) => setName(e.target.value)}
              placeholder="Member name"
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'Director' | 'Co-manager' | 'Member')}
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

  const handleSubmit = (e: React.FormEvent) => {
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
              onChange={(e) => setTitle(e.target.value)}
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
              onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 60)}
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

export default App;
