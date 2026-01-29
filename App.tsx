import React, { useState, useEffect } from 'react';
import { User, EventData, Message, AvailabilitySlot, CalendarEvent, ProposedTimeSlot, Logistics, MEMBER_BADGES } from './types';
import { TIME_SLOTS, ALL_TIME_SLOTS, Icons } from './constants';
import AvailabilityGrid from './components/AvailabilityGrid';
import LogisticsHub from './components/LogisticsHub';
import ChatRoom from './components/ChatRoom';
import { parseLogisticsFromChat } from './services/geminiService';
import { fetchUserCalendar, checkAppleCalendarAuth, authenticateAppleCalendar, disconnectAppleCalendar } from './services/calendarService';
import { getDatesInRange, formatDateShort } from './utils/dateUtils';
import { analyzeAvailability } from './utils/availabilityAnalysis';

// Storage keys
const STORAGE_KEYS = {
  USER: 'syncup_user',
  EVENTS: 'syncup_events',
};

// Load from localStorage
const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
};

// Save to localStorage
const saveToStorage = <T,>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
};

const App: React.FC = () => {
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showCalendarForm, setShowCalendarForm] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [isAppleCalendarConnected, setIsAppleCalendarConnected] = useState(false);
  const [appleCalendarEmail, setAppleCalendarEmail] = useState<string | null>(null);
  const [useRealCalendar, setUseRealCalendar] = useState(false);
  const [showAppleCalendarForm, setShowAppleCalendarForm] = useState(false);
  const [showEventCreator, setShowEventCreator] = useState(false);
  const [showEventList, setShowEventList] = useState(false);
  const [showMemberManager, setShowMemberManager] = useState(false);
  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [inviteEventId, setInviteEventId] = useState<string | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(false);
  
  // Multi-event support - load from localStorage
  const [events, setEvents] = useState<EventData[]>(() => loadFromStorage(STORAGE_KEYS.EVENTS, []));
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(() => loadFromStorage(STORAGE_KEYS.USER, null));
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => loadFromStorage(STORAGE_KEYS.USER, null) !== null);

  const [activeTab, setActiveTab] = useState<'grid' | 'logistics' | 'chat'>('grid');

  // Save events to localStorage when they change
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.EVENTS, events);
  }, [events]);

  // Save user to localStorage when it changes
  useEffect(() => {
    if (currentUser) {
      saveToStorage(STORAGE_KEYS.USER, currentUser);
    }
  }, [currentUser]);

  // Handle login
  const handleLogin = (name: string) => {
    const user: User = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      role: 'Member'
    };
    setCurrentUser(user);
    setIsLoggedIn(true);
    saveToStorage(STORAGE_KEYS.USER, user);
    setShowLoginForm(false);
  };

  // Handle logout
  const handleLogout = () => {
    setCurrentUser(null);
    setIsLoggedIn(false);
    setCurrentEventId(null);
    localStorage.removeItem(STORAGE_KEYS.USER);
  };

  // Check for invite link on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('join');
    const encodedData = params.get('data');
    
    if (eventId && !showJoinForm) {
      setInviteEventId(eventId);
      setShowJoinForm(true);
      
      // Check if event exists locally (use callback form to get latest state)
      setEvents(prevEvents => {
        const existingEvent = prevEvents.find(e => e.id === eventId);
        
        if (!existingEvent && encodedData) {
          // Event doesn't exist locally, create it from URL data
          try {
            const eventData = JSON.parse(decodeURIComponent(atob(encodedData)));
            
            // Generate slots for the event
            const startIdx = ALL_TIME_SLOTS.indexOf(eventData.timeRange.startTime as typeof ALL_TIME_SLOTS[number]);
            const endIdx = ALL_TIME_SLOTS.indexOf(eventData.timeRange.endTime as typeof ALL_TIME_SLOTS[number]);
            const selectedTimeSlots = ALL_TIME_SLOTS.slice(startIdx, endIdx + 1);
            const dates = getDatesInRange(eventData.dateRange.startDate, eventData.dateRange.endDate);
            const slots: AvailabilitySlot[] = [];
            
            dates.forEach((date: string) => {
              selectedTimeSlots.forEach((time: string) => {
                slots.push({ date, time, availableUsers: [] });
              });
            });
            
            const newEvent: EventData = {
              id: eventData.id,
              title: eventData.title,
              description: eventData.description || '',
              creatorId: eventData.creatorId,
              logistics: { venue: '', wardrobe: '', materials: '', notes: '' },
              dateRange: eventData.dateRange,
              timeRange: eventData.timeRange,
              slots,
              messages: [],
              members: [], // Will be populated when user joins
              isLocked: false
            };
            
            return [...prevEvents, newEvent];
          } catch (e) {
            console.error('Failed to parse invite link data:', e);
            return prevEvents;
          }
        }
        return prevEvents;
      });
    }
  }, [showJoinForm]);

  // Get current event
  const event = events.find(e => e.id === currentEventId) || null;

  // Update current event helper
  const updateCurrentEvent = (updater: (prev: EventData) => EventData) => {
    setEvents(prevEvents => 
      prevEvents.map(e => e.id === currentEventId ? updater(e) : e)
    );
  };

  // Create new event
  const handleCreateEvent = (eventData: { 
    title: string; 
    description: string; 
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
  }) => {
    if (!currentUser) return;
    
    // Creator is always Director for the event they create
    const creator: User = { ...currentUser, role: 'Director' };
    
    // Get time slots within the selected range
    const startIdx = ALL_TIME_SLOTS.indexOf(eventData.startTime as typeof ALL_TIME_SLOTS[number]);
    const endIdx = ALL_TIME_SLOTS.indexOf(eventData.endTime as typeof ALL_TIME_SLOTS[number]);
    const selectedTimeSlots = ALL_TIME_SLOTS.slice(startIdx, endIdx + 1);
    
    // Generate slots for all dates in range
    const dates = getDatesInRange(eventData.startDate, eventData.endDate);
    const slots: AvailabilitySlot[] = [];
    
    dates.forEach((date: string) => {
      selectedTimeSlots.forEach((time: string) => {
        slots.push({
          date,
          time,
          availableUsers: []
        });
      });
    });
    
    const newEventId = Math.random().toString(36).substr(2, 9);
    const newEvent: EventData = {
      id: newEventId,
      title: eventData.title,
      description: eventData.description,
      creatorId: creator.id,
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
      timeRange: {
        startTime: eventData.startTime,
        endTime: eventData.endTime
      },
      slots,
      messages: [
        {
          id: `sys-${Date.now()}`,
          userId: 'system',
          userName: 'SyncUp',
          text: `${creator.name} created the event (${eventData.startDate} to ${eventData.endDate}, ${eventData.startTime} - ${eventData.endTime})`,
          timestamp: Date.now(),
          isSystem: true
        }
      ],
      members: [creator],
      isLocked: false
    };
    
    setEvents(prev => [...prev, newEvent]);
    setCurrentEventId(newEventId);
    setShowEventCreator(false);
    setShowEventList(false);
  };

  // Delete event
  const handleDeleteEvent = (eventId: string) => {
    setEvents(prev => prev.filter(e => e.id !== eventId));
    if (currentEventId === eventId) {
      const remaining = events.filter(e => e.id !== eventId);
      setCurrentEventId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // Switch to event
  const handleSwitchEvent = (eventId: string) => {
    setCurrentEventId(eventId);
    setShowEventList(false);
  };

  // Add member
  const handleAddMember = (memberData: { name: string; role: 'Director' | 'Co-manager' | 'Member'; badge?: string }) => {
    if (!event) return;
    const newMember: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: memberData.name,
      role: memberData.role,
      badge: memberData.badge
    };
    
    updateCurrentEvent(prev => ({
      ...prev,
      members: [...prev.members, newMember],
      messages: [
        ...prev.messages,
        {
          id: `sys-member-${Date.now()}`,
          userId: 'system',
          userName: 'SyncUp',
          text: `${memberData.badge ? memberData.badge + ' ' : ''}${memberData.name} joined the event`,
          timestamp: Date.now(),
          isSystem: true
        }
      ]
    }));
    setShowMemberForm(false);
  };

  // Update member (badge, role, name)
  const handleUpdateMember = (memberId: string, updates: Partial<User>) => {
    if (!event) return;
    updateCurrentEvent(prev => ({
      ...prev,
      members: prev.members.map(m => m.id === memberId ? { ...m, ...updates } : m)
    }));
    setEditingMember(null);
  };

  // Remove member
  const handleRemoveMember = (memberId: string) => {
    if (!event) return;
    const member = event.members.find(m => m.id === memberId);
    if (!member) return;
    
    // Don't allow removing the creator
    if (memberId === event.creatorId) {
      alert("Cannot remove the event creator");
      return;
    }
    
    updateCurrentEvent(prev => ({
      ...prev,
      members: prev.members.filter(m => m.id !== memberId),
      // Also remove their availability
      slots: prev.slots.map(slot => ({
        ...slot,
        availableUsers: slot.availableUsers.filter(id => id !== memberId)
      })),
      messages: [
        ...prev.messages,
        {
          id: `sys-member-remove-${Date.now()}`,
          userId: 'system',
          userName: 'SyncUp',
          text: `${member.name} was removed from the event`,
          timestamp: Date.now(),
          isSystem: true
        }
      ]
    }));
  };

  // Join event via invite link
  const handleJoinViaLink = (memberData: { name: string; badge?: string }) => {
    if (!inviteEventId) return;
    
    const targetEvent = events.find(e => e.id === inviteEventId);
    if (!targetEvent) {
      alert("Event not found. The link may be invalid or the event was deleted.");
      setShowJoinForm(false);
      setInviteEventId(null);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    
    // Check if user with same name already exists in this event
    const existingMember = targetEvent.members.find(m => m.name === memberData.name);
    if (existingMember) {
      // User already in this event, just switch to it
      setCurrentUser(existingMember);
      setIsLoggedIn(true);
      saveToStorage(STORAGE_KEYS.USER, existingMember);
      setCurrentEventId(inviteEventId);
      setShowJoinForm(false);
      setInviteEventId(null);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    
    // Create new member
    const newMember: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: memberData.name,
      role: 'Member',
      badge: memberData.badge
    };
    
    setEvents(prev => prev.map(e => {
      if (e.id !== inviteEventId) return e;
      return {
        ...e,
        members: [...e.members, newMember],
        messages: [
          ...e.messages,
          {
            id: `sys-join-${Date.now()}`,
            userId: 'system',
            userName: 'SyncUp',
            text: `${memberData.badge ? memberData.badge + ' ' : ''}${memberData.name} joined via invite link`,
            timestamp: Date.now(),
            isSystem: true
          }
        ]
      };
    }));
    
    setCurrentUser(newMember);
    setIsLoggedIn(true);
    saveToStorage(STORAGE_KEYS.USER, newMember);
    setCurrentEventId(inviteEventId);
    setShowJoinForm(false);
    setInviteEventId(null);
    window.history.replaceState({}, '', window.location.pathname);
  };

  // Generate invite link with event data encoded
  const getInviteLink = () => {
    if (!event) return '';
    const baseUrl = window.location.origin + window.location.pathname;
    // Encode essential event data in the URL so others can join even without localStorage
    const eventData = {
      id: event.id,
      title: event.title,
      description: event.description,
      dateRange: event.dateRange,
      timeRange: event.timeRange,
      creatorId: event.creatorId
    };
    const encodedData = btoa(encodeURIComponent(JSON.stringify(eventData)));
    return `${baseUrl}?join=${event.id}&data=${encodedData}`;
  };

  // Copy invite link to clipboard
  const handleCopyInviteLink = () => {
    const link = getInviteLink();
    navigator.clipboard.writeText(link).then(() => {
      alert('Invite link copied to clipboard!');
    }).catch(() => {
      // Fallback for older browsers
      prompt('Copy this invite link:', link);
    });
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

    updateCurrentEvent(prev => ({
      ...prev,
      messages: [...prev.messages, newMessage]
    }));

    // AI Parsing for Directors/Co-managers
    if (currentUser.role === 'Director' || currentUser.role === 'Co-manager') {
      const updates = await parseLogisticsFromChat(text, event.logistics);
      if (updates) {
        updateCurrentEvent(prev => ({
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
        }));
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

    updateCurrentEvent(prev => ({
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
    }));
  };

  // Analyze availability and generate proposed time slots
  const handleAnalyzeAvailability = () => {
    if (!event) return;
    
    const proposedSlots = analyzeAvailability(event.slots, event.members, event.dateRange);
    
    updateCurrentEvent(prev => ({
      ...prev,
      proposedTimeSlots: proposedSlots
    }));
  };

  // Director selects a time slot for approval
  const handleSelectTimeSlot = (slot: ProposedTimeSlot) => {
    if (!event || !currentUser) return;
    
    updateCurrentEvent(prev => ({
      ...prev,
      approvedTimeSlot: slot
    }));
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

    updateCurrentEvent(prev => ({
      ...prev,
      messages: [...prev.messages, message]
    }));

    // Switch to chat tab
    setActiveTab('chat');
  };

  const handleLockEvent = (date: string, time: string) => {
    if (!event || !currentUser) return;
    const lockedKey = `${date}|${time}`;
    updateCurrentEvent(prev => ({
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
    }));
  };

  const handleUnlockEvent = () => {
    if (!event || !currentUser) return;
    updateCurrentEvent(prev => ({
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
    }));
  };

  const canEdit = !!(currentUser && (currentUser.role === 'Director' || currentUser.role === 'Co-manager'));

  // Show join form if accessing via invite link
  if (showJoinForm && inviteEventId) {
    const inviteEvent = events.find(e => e.id === inviteEventId);
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative shadow-2xl overflow-hidden">
        <header className="bg-white border-b border-gray-100 p-6">
          <h1 className="text-2xl font-black text-indigo-600 tracking-tighter">SyncUp</h1>
          <p className="text-gray-600 text-sm mt-2">Join Event</p>
        </header>
        
        <main className="flex-1 p-4">
          {inviteEvent ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="mb-4 p-4 bg-indigo-50 rounded-xl">
                <p className="text-xs text-indigo-600 font-bold uppercase mb-1">You're invited to</p>
                <h2 className="font-bold text-indigo-900 text-lg">{inviteEvent.title}</h2>
                <p className="text-sm text-indigo-700 mt-1">
                  {formatDateShort(inviteEvent.dateRange.startDate)} - {formatDateShort(inviteEvent.dateRange.endDate)}
                </p>
                <p className="text-xs text-indigo-500 mt-2">{inviteEvent.members.length} members</p>
              </div>
              <JoinEventForm onSubmit={handleJoinViaLink} onCancel={() => {
                setShowJoinForm(false);
                setInviteEventId(null);
                window.history.replaceState({}, '', window.location.pathname);
              }} />
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
              <p className="text-gray-500 mb-4">Event not found. The link may be invalid or the event was deleted.</p>
              <button
                onClick={() => {
                  setShowJoinForm(false);
                  setInviteEventId(null);
                  window.history.replaceState({}, '', window.location.pathname);
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700"
              >
                Go to Home
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // Show landing page / login if not logged in
  if (!isLoggedIn || !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex flex-col max-w-md mx-auto relative shadow-2xl overflow-hidden">
        {/* Landing Page */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-white">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-black tracking-tighter mb-4">SyncUp</h1>
            <p className="text-white/80 text-lg">Coordinate schedules effortlessly with your team</p>
          </div>
          
          <div className="w-full space-y-4">
            {showLoginForm ? (
              <div className="bg-white rounded-2xl p-6 shadow-xl">
                <h2 className="font-bold text-gray-900 mb-4 text-center">Welcome!</h2>
                <LoginForm onLogin={handleLogin} />
                <button
                  onClick={() => setShowLoginForm(false)}
                  className="w-full mt-4 text-gray-500 text-sm hover:text-gray-700"
                >
                  Back
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowLoginForm(true)}
                  className="w-full bg-white text-indigo-600 py-4 rounded-2xl font-bold text-lg hover:bg-gray-100 transition-colors shadow-lg"
                >
                  Get Started
                </button>
                <div className="text-center text-white/60 text-sm mt-6">
                  <p>Create events, share availability, and find the perfect time to meet.</p>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Feature highlights */}
        <div className="bg-white/10 backdrop-blur-sm p-6 border-t border-white/20">
          <div className="grid grid-cols-3 gap-4 text-center text-white text-xs">
            <div>
              <div className="text-2xl mb-1">📅</div>
              <div className="font-bold">Schedule</div>
            </div>
            <div>
              <div className="text-2xl mb-1">👥</div>
              <div className="font-bold">Collaborate</div>
            </div>
            <div>
              <div className="text-2xl mb-1">✨</div>
              <div className="font-bold">Sync</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show My Events page (logged in but viewing events list)
  if (!currentEventId || showEventList) {
    // Get events where current user is a member
    const myEvents = events.filter(e => e.members.some(m => m.id === currentUser.id));
    
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative shadow-2xl overflow-hidden">
        <header className="bg-white border-b border-gray-100 p-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-black text-indigo-600 tracking-tighter">SyncUp</h1>
              <p className="text-gray-600 text-sm mt-1">Welcome, {currentUser.name}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1 rounded-full border border-gray-200 hover:border-gray-300"
            >
              Logout
            </button>
          </div>
        </header>
        
        <main className="flex-1 p-4 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-900">My Events</h2>
            <button
              onClick={() => setShowEventCreator(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"
            >
              + Create Event
            </button>
          </div>
          
          {myEvents.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📅</div>
              <h3 className="font-bold text-gray-900 mb-2">No events yet</h3>
              <p className="text-gray-500 text-sm mb-6">Create your first event or join one via invite link</p>
              <button
                onClick={() => setShowEventCreator(true)}
                className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
              >
                Create Event
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {myEvents.map(e => {
                const myMembership = e.members.find(m => m.id === currentUser.id);
                return (
                  <button
                    key={e.id}
                    onClick={() => {
                      setCurrentEventId(e.id);
                      setShowEventList(false);
                    }}
                    className="w-full p-4 bg-white rounded-2xl shadow-sm border border-gray-100 text-left hover:border-indigo-300 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-bold text-gray-900">{e.title}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatDateShort(e.dateRange.startDate)} - {formatDateShort(e.dateRange.endDate)}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {e.members.length} members
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        {myMembership?.role === 'Director' && (
                          <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                            Director
                          </span>
                        )}
                        {myMembership?.role === 'Co-manager' && (
                          <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                            Co-manager
                          </span>
                        )}
                        {e.isLocked && (
                          <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase mt-1">
                            Confirmed
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              
              <button
                onClick={() => setShowEventCreator(true)}
                className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors text-center"
              >
                + Create New Event
              </button>
            </div>
          )}
        </main>

        {/* Event Creator Modal */}
        {showEventCreator && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-900">Create New Event</h3>
                <button onClick={() => setShowEventCreator(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <EventCreationForm onSubmit={(data) => {
                handleCreateEvent(data);
                setShowEventCreator(false);
                setShowEventList(false);
              }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Safety check - should not happen given the logic above
  if (!event) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative shadow-2xl overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 p-6 sticky top-0 z-30">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-indigo-600 tracking-tighter">SyncUp</h1>
            <button 
              onClick={() => setShowEventList(true)}
              className="flex items-center space-x-2 mt-1 group"
            >
              <p className="text-gray-900 font-bold text-lg group-hover:text-indigo-600 transition-colors">{event.title}</p>
              <span className="text-gray-400 group-hover:text-indigo-600">▼</span>
            </button>
            {events.length > 1 && (
              <p className="text-[10px] text-gray-400 mt-0.5">{events.length} events total</p>
            )}
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
        {/* Members Display */}
        <div className="mb-4 bg-white rounded-xl border border-gray-100 p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase">Members ({event.members.length})</h4>
            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={() => setShowMemberManager(true)}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                >
                  Manage
                </button>
              )}
              <button
                onClick={handleCopyInviteLink}
                className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                🔗 Invite Link
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {event.members.map((member: User) => (
              <div 
                key={member.id}
                className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                  member.id === currentUser?.id 
                    ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300' 
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {member.badge && <span>{member.badge.split(' ')[0]}</span>}
                <span>{member.name}</span>
                {member.role !== 'Member' && (
                  <span className="text-[9px] opacity-60">({member.role})</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
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
              timeRange={event.timeRange}
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
              onUpdate={(updates: Partial<Logistics>) => updateCurrentEvent(prev => ({
                ...prev,
                logistics: { ...prev.logistics, ...updates }
              }))}
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

      {/* Event List Modal */}
      {showEventList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900">Your Events</h3>
              <button onClick={() => setShowEventList(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            
            <div className="space-y-3 mb-4">
              {events.map(e => (
                <div
                  key={e.id}
                  className={`p-4 rounded-xl border-2 transition-colors ${
                    e.id === currentEventId 
                      ? 'border-indigo-500 bg-indigo-50' 
                      : 'border-gray-100 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <button
                      onClick={() => handleSwitchEvent(e.id)}
                      className="flex-1 text-left"
                    >
                      <div className="font-bold text-gray-900 flex items-center gap-2">
                        {e.title}
                        {e.id === currentEventId && (
                          <span className="text-[9px] bg-indigo-600 text-white px-2 py-0.5 rounded-full">Current</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatDateShort(e.dateRange.startDate)} - {formatDateShort(e.dateRange.endDate)}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {e.members.length} members • {e.isLocked ? '🔒 Locked' : '🔓 Open'}
                      </div>
                    </button>
                    {canEdit && e.id !== currentEventId && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${e.title}"?`)) {
                            handleDeleteEvent(e.id);
                          }
                        }}
                        className="text-rose-400 hover:text-rose-600 p-1"
                        title="Delete event"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <button
              onClick={() => {
                setShowEventList(false);
                setShowEventCreator(true);
              }}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
            >
              + Create New Event
            </button>
          </div>
        </div>
      )}

      {/* Event Creation Modal (when already has events) */}
      {showEventCreator && event && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900">Create New Event</h3>
              <button onClick={() => setShowEventCreator(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <EventCreationForm onSubmit={handleCreateEvent} />
          </div>
        </div>
      )}

      {/* Member Manager Modal */}
      {showMemberManager && event && (
        <MemberManagerModal
          members={event.members}
          currentUserId={currentUser?.id || ''}
          creatorId={event.creatorId}
          onClose={() => {
            setShowMemberManager(false);
            setEditingMember(null);
          }}
          onUpdateMember={handleUpdateMember}
          onRemoveMember={handleRemoveMember}
          onAddMember={() => {
            setShowMemberManager(false);
            setShowMemberForm(true);
          }}
          editingMember={editingMember}
          setEditingMember={setEditingMember}
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
  onSubmit: (data: { title: string; description: string; startDate: string; endDate: string; startTime: string; endTime: string }) => void;
}> = ({ onSubmit }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
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
  
  // Time range (default 9 AM to 9 PM)
  const [startTime, setStartTime] = useState('09:00 AM');
  const [endTime, setEndTime] = useState('09:00 PM');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (startDate > endDate) {
      alert('End date must be after start date');
      return;
    }
    // Validate time range
    const startIdx = ALL_TIME_SLOTS.indexOf(startTime as typeof ALL_TIME_SLOTS[number]);
    const endIdx = ALL_TIME_SLOTS.indexOf(endTime as typeof ALL_TIME_SLOTS[number]);
    if (startIdx >= endIdx) {
      alert('End time must be after start time');
      return;
    }
    onSubmit({ title, description, startDate, endDate, startTime, endTime });
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
          autoFocus
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
          placeholder="Event description..."
          rows={2}
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />
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
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Availability Time Range</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 mb-1 block">Start Time</label>
            <select
              value={startTime}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStartTime(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            >
              {ALL_TIME_SLOTS.map(time => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 mb-1 block">End Time</label>
            <select
              value={endTime}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEndTime(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            >
              {ALL_TIME_SLOTS.map(time => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">
          Members will only see time slots within this range
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
  onSubmit: (data: { name: string; role: 'Director' | 'Co-manager' | 'Member'; badge?: string }) => void;
}> = ({ onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'Director' | 'Co-manager' | 'Member'>('Member');
  const [badge, setBadge] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name, role, badge: badge || undefined });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
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
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role (Badge)</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {MEMBER_BADGES.map(b => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => setBadge(`${b.emoji} ${b.label}`)}
                  className={`px-2 py-1 rounded-lg text-xs transition-colors ${
                    badge === `${b.emoji} ${b.label}`
                      ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {b.emoji} {b.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={badge}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBadge(e.target.value)}
              placeholder="Or enter custom (e.g., 🎵 DJ)"
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Permission Level</label>
            <select
              value={role}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRole(e.target.value as 'Director' | 'Co-manager' | 'Member')}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            >
              <option value="Member">Member (can vote)</option>
              <option value="Co-manager">Co-manager (can edit)</option>
              <option value="Director">Director (full control)</option>
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

// Member Manager Modal Component
const MemberManagerModal: React.FC<{
  members: User[];
  currentUserId: string;
  creatorId: string;
  onClose: () => void;
  onUpdateMember: (memberId: string, updates: Partial<User>) => void;
  onRemoveMember: (memberId: string) => void;
  onAddMember: () => void;
  editingMember: User | null;
  setEditingMember: (member: User | null) => void;
}> = ({ members, currentUserId, creatorId, onClose, onUpdateMember, onRemoveMember, onAddMember, editingMember, setEditingMember }) => {
  const [editName, setEditName] = useState('');
  const [editBadge, setEditBadge] = useState('');
  const [editRole, setEditRole] = useState<'Director' | 'Co-manager' | 'Member'>('Member');

  const startEditing = (member: User) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditBadge(member.badge || '');
    setEditRole(member.role);
  };

  const saveEdit = () => {
    if (!editingMember || !editName.trim()) return;
    onUpdateMember(editingMember.id, {
      name: editName,
      badge: editBadge || undefined,
      role: editRole
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-900">Manage Members</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {editingMember ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Badge</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {MEMBER_BADGES.map(b => (
                  <button
                    key={b.label}
                    type="button"
                    onClick={() => setEditBadge(`${b.emoji} ${b.label}`)}
                    className={`px-2 py-1 rounded-lg text-xs transition-colors ${
                      editBadge === `${b.emoji} ${b.label}`
                        ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {b.emoji} {b.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setEditBadge('')}
                  className={`px-2 py-1 rounded-lg text-xs transition-colors ${
                    !editBadge ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  None
                </button>
              </div>
              <input
                type="text"
                value={editBadge}
                onChange={(e) => setEditBadge(e.target.value)}
                placeholder="Custom badge (e.g., 🎵 DJ)"
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Permission Level</label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as typeof editRole)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                disabled={editingMember.id === creatorId}
              >
                <option value="Member">Member</option>
                <option value="Co-manager">Co-manager</option>
                <option value="Director">Director</option>
              </select>
              {editingMember.id === creatorId && (
                <p className="text-[10px] text-gray-400 mt-1">Creator's role cannot be changed</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditingMember(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {members.map(member => (
                <div
                  key={member.id}
                  className={`p-3 rounded-xl border ${
                    member.id === currentUserId ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {member.badge && <span className="text-lg">{member.badge.split(' ')[0]}</span>}
                      <div>
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          {member.name}
                          {member.id === currentUserId && (
                            <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded">You</span>
                          )}
                          {member.id === creatorId && (
                            <span className="text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded">Creator</span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {member.badge && <span>{member.badge} • </span>}
                          {member.role}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEditing(member)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                        title="Edit"
                      >
                        ✏️
                      </button>
                      {member.id !== creatorId && (
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${member.name} from this event?`)) {
                              onRemoveMember(member.id);
                            }
                          }}
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                          title="Remove"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={onAddMember}
              className="w-full py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700"
            >
              + Add Member
            </button>
          </>
        )}
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

// Login Form Component
const LoginForm: React.FC<{
  onLogin: (name: string) => void;
}> = ({ onLogin }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    onLogin(name.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Your Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
          required
          autoFocus
        />
      </div>
      <button
        type="submit"
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
      >
        Continue
      </button>
    </form>
  );
};

// Join Event Form Component (for invite links)
const JoinEventForm: React.FC<{
  onSubmit: (data: { name: string; badge?: string }) => void;
  onCancel: () => void;
}> = ({ onSubmit, onCancel }) => {
  const [name, setName] = useState('');
  const [badge, setBadge] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name, badge: badge || undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Your Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          required
          autoFocus
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Your Role (optional)</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {MEMBER_BADGES.slice(0, 10).map(b => (
            <button
              key={b.label}
              type="button"
              onClick={() => setBadge(`${b.emoji} ${b.label}`)}
              className={`px-2 py-1 rounded-lg text-xs transition-colors ${
                badge === `${b.emoji} ${b.label}`
                  ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {b.emoji} {b.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={badge}
          onChange={(e) => setBadge(e.target.value)}
          placeholder="Or enter custom (e.g., 🎵 DJ)"
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-bold"
        >
          Join Event
        </button>
      </div>
    </form>
  );
};

export default App;
