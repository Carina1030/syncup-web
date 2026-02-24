import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, EventData, Message, AvailabilitySlot, CalendarEvent, ProposedTimeSlot, Logistics, MEMBER_BADGES, UserProfile, FriendRequest, EventInvitation } from './types';
import { TIME_SLOTS, ALL_TIME_SLOTS, Icons } from './constants';
import AvailabilityGrid from './components/AvailabilityGrid';
import LogisticsHub from './components/LogisticsHub';
import ChatRoom from './components/ChatRoom';
import { parseLogisticsFromChat } from './services/geminiService';
import { fetchUserCalendar, checkAppleCalendarAuth, authenticateAppleCalendar, disconnectAppleCalendar } from './services/calendarService';
import { getDatesInRange, formatDateShort } from './utils/dateUtils';
import { analyzeAvailability } from './utils/availabilityAnalysis';
import { 
  saveEvent, getEvent, subscribeToEvent, getUserEvents, signInWithGoogle, signOutUser, subscribeToAuthState,
  saveUserProfile, getUserProfile, getUserFriends,
  sendFriendRequest, updateFriendRequestStatus, addFriend, removeFriend,
  sendEventInvitation, updateEventInvitationStatus,
  subscribeToEventInvitations, subscribeToFriendRequests
} from './services/firebase';

// Storage keys
const STORAGE_KEYS = {
  USER: 'syncup_user',
  CURRENT_EVENT: 'syncup_current_event',
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
  const [showEventMenu, setShowEventMenu] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [showInviteFriendsModal, setShowInviteFriendsModal] = useState(false);
  
  // Friends and invitations
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [eventInvitations, setEventInvitations] = useState<EventInvitation[]>([]);
  
  // Multi-event support
  const [events, setEvents] = useState<EventData[]>([]);
  const [currentEventId, setCurrentEventId] = useState<string | null>(() => loadFromStorage(STORAGE_KEYS.CURRENT_EVENT, null));
  const [currentUser, setCurrentUser] = useState<User | null>(() => loadFromStorage(STORAGE_KEYS.USER, null));
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => loadFromStorage(STORAGE_KEYS.USER, null) !== null);
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'grid' | 'logistics' | 'chat'>('grid');
  
  // Track subscriptions
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  // Debounce ref for Firebase saves
  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const isLocalEditingRef = useRef(false);
  const lastLocalEditTimeRef = useRef(0);

  // Load user's events from Firebase on login
  useEffect(() => {
    const loadUserEvents = async () => {
      if (currentUser && isLoggedIn) {
        setIsLoading(true);
        try {
          // Pass both ID and name to find all events (including historical ones with different IDs)
          const userEvents = await getUserEvents(currentUser.id, currentUser.name);
          let finalEvents = [...userEvents];
          
          // If there's an invite event ID, make sure we keep that event too
          const eventIdToFetch = inviteEventId || currentEventId;
          if (eventIdToFetch) {
            const eventExists = userEvents.some(e => e.id === eventIdToFetch);
            if (!eventExists) {
              // Fetch the event from Firebase and add it
              const fetchedEvent = await getEvent(eventIdToFetch);
              if (fetchedEvent) {
                finalEvents = [...userEvents, fetchedEvent];
              }
            }
          }
          
          setEvents(finalEvents);
        } catch (error) {
          console.error('Failed to load events from Firebase:', error);
        }
        setIsLoading(false);
      } else {
        // Not logged in - but if there's an invite event, keep it
        if (inviteEventId) {
          setEvents(prev => prev.filter(e => e.id === inviteEventId));
        } else {
          setEvents([]);
        }
        setIsLoading(false);
      }
    };
    loadUserEvents();
  }, [currentUser?.id, isLoggedIn, inviteEventId, currentEventId]);

  // Subscribe to current event for real-time updates
  useEffect(() => {
    // Cleanup previous subscription
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    if (currentEventId) {
      unsubscribeRef.current = subscribeToEvent(currentEventId, (updatedEvent) => {
        if (updatedEvent) {
          // Skip Firebase updates if we're currently editing locally
          // This prevents Firebase updates from overwriting local changes during drag operations
          const timeSinceLastEdit = Date.now() - lastLocalEditTimeRef.current;
          if (isLocalEditingRef.current || timeSinceLastEdit < 1500) {
            console.log('Skipping Firebase update during local edit');
            return;
          }
          
          setEvents(prev => 
            prev.map(e => e.id === currentEventId ? updatedEvent : e)
          );
        }
      });
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [currentEventId]);

  // Save user to localStorage when it changes
  useEffect(() => {
    if (currentUser) {
      saveToStorage(STORAGE_KEYS.USER, currentUser);
    }
  }, [currentUser]);

  // Save currentEventId to localStorage when it changes
  useEffect(() => {
    if (currentEventId) {
      saveToStorage(STORAGE_KEYS.CURRENT_EVENT, currentEventId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_EVENT);
    }
  }, [currentEventId]);

  // Subscribe to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      if (firebaseUser) {
        // User is signed in with Google
        const user: User = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          role: 'Member',
          email: firebaseUser.email || undefined,
          photoURL: firebaseUser.photoURL || undefined
        };
        setCurrentUser(user);
        setIsLoggedIn(true);
        saveToStorage(STORAGE_KEYS.USER, user);
        
        // Save/update user profile in Firebase (fire-and-forget with error handling)
        if (firebaseUser.email) {
          (async () => {
            try {
              const profile: UserProfile = {
                id: firebaseUser.uid,
                name: user.name,
                email: firebaseUser.email!.toLowerCase(),
                photoURL: firebaseUser.photoURL || undefined,
                friends: [],
                createdAt: Date.now()
              };
              const existingProfile = await getUserProfile(firebaseUser.uid);
              if (existingProfile) {
                profile.friends = existingProfile.friends || [];
                profile.createdAt = existingProfile.createdAt;
              }
              await saveUserProfile(profile);
            } catch (error) {
              console.error('Failed to save user profile:', error);
            }
          })();
        }
      }
      // Note: We don't auto-logout here to allow manual name login to persist
    });

    return () => unsubscribe();
  }, []);

  // Load friends and subscribe to invitations when user logs in
  useEffect(() => {
    if (!currentUser?.id) return;
    
    // Load friends list
    const loadFriends = async () => {
      try {
        const friendsList = await getUserFriends(currentUser.id);
        setFriends(friendsList);
      } catch (error) {
        console.error('Failed to load friends:', error);
      }
    };
    loadFriends();
    
    // Only subscribe to real-time updates if user has email (Google account)
    // These queries need Firestore composite indexes
    const cleanups: Array<() => void> = [];
    
    if (currentUser.email) {
      try {
        const unsubFriendReqs = subscribeToFriendRequests(currentUser.email, (requests) => {
          setFriendRequests(requests);
        });
        cleanups.push(unsubFriendReqs);
      } catch (error) {
        console.error('Failed to subscribe to friend requests:', error);
      }
    }
    
    try {
      const unsubEventInvites = subscribeToEventInvitations(currentUser.id, (invites) => {
        setEventInvitations(invites);
      });
      cleanups.push(unsubEventInvites);
    } catch (error) {
      console.error('Failed to subscribe to event invitations:', error);
    }
    
    return () => {
      cleanups.forEach(fn => fn());
    };
  }, [currentUser?.id, currentUser?.email]);

  // Helper to save event to Firebase
  const saveEventToFirebase = useCallback(async (event: EventData) => {
    try {
      await saveEvent(event);
    } catch (error) {
      console.error('Failed to save event to Firebase:', error);
    }
  }, []);

  // Handle Google login
  const handleGoogleLogin = async () => {
    try {
      const firebaseUser = await signInWithGoogle();
      if (firebaseUser) {
        const user: User = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          role: 'Member',
          email: firebaseUser.email || undefined,
          photoURL: firebaseUser.photoURL || undefined
        };
        setCurrentUser(user);
        setIsLoggedIn(true);
        saveToStorage(STORAGE_KEYS.USER, user);
        setShowLoginForm(false);
      }
    } catch (error) {
      console.error('Google login failed:', error);
      alert('Google login failed. Please try again.');
    }
  };

  // Handle manual name login (fallback)
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
  const handleLogout = async () => {
    try {
      await signOutUser();
    } catch (error) {
      console.error('Sign out error:', error);
    }
    setCurrentUser(null);
    setIsLoggedIn(false);
    setCurrentEventId(null);
    setFriends([]);
    setFriendRequests([]);
    setEventInvitations([]);
    localStorage.removeItem(STORAGE_KEYS.USER);
  };

  // ============ Friend Functions ============
  
  // Send friend request by email
  const handleSendFriendRequest = async (email: string) => {
    if (!currentUser?.email) {
      alert('You need to be logged in with Google to add friends.');
      return;
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    if (normalizedEmail === currentUser.email.toLowerCase()) {
      alert("You can't add yourself as a friend!");
      return;
    }
    
    // Check if already friends
    const alreadyFriend = friends.some(f => f.email.toLowerCase() === normalizedEmail);
    if (alreadyFriend) {
      alert('This person is already your friend!');
      return;
    }
    
    const request: FriendRequest = {
      id: Math.random().toString(36).substr(2, 9),
      fromUserId: currentUser.id,
      fromUserName: currentUser.name,
      fromUserEmail: currentUser.email,
      fromUserPhoto: currentUser.photoURL,
      toUserEmail: normalizedEmail,
      status: 'pending',
      createdAt: Date.now()
    };
    
    try {
      await sendFriendRequest(request);
      alert(`Friend request sent to ${email}!`);
    } catch (error) {
      console.error('Failed to send friend request:', error);
      alert('Failed to send friend request. Please try again.');
    }
  };
  
  // Accept friend request
  const handleAcceptFriendRequest = async (request: FriendRequest) => {
    if (!currentUser) return;
    
    try {
      // Update request status
      await updateFriendRequestStatus(request.id, 'accepted');
      
      // Add each other as friends
      await addFriend(currentUser.id, request.fromUserId);
      await addFriend(request.fromUserId, currentUser.id);
      
      // Reload friends list
      const friendsList = await getUserFriends(currentUser.id);
      setFriends(friendsList);
      
      alert(`You are now friends with ${request.fromUserName}!`);
    } catch (error) {
      console.error('Failed to accept friend request:', error);
      alert('Failed to accept friend request. Please try again.');
    }
  };
  
  // Reject friend request
  const handleRejectFriendRequest = async (request: FriendRequest) => {
    try {
      await updateFriendRequestStatus(request.id, 'rejected');
    } catch (error) {
      console.error('Failed to reject friend request:', error);
    }
  };
  
  // Remove friend
  const handleRemoveFriend = async (friendId: string) => {
    if (!currentUser) return;
    
    const friend = friends.find(f => f.id === friendId);
    if (!confirm(`Remove ${friend?.name || 'this friend'} from your friends list?`)) {
      return;
    }
    
    try {
      await removeFriend(currentUser.id, friendId);
      setFriends(prev => prev.filter(f => f.id !== friendId));
    } catch (error) {
      console.error('Failed to remove friend:', error);
      alert('Failed to remove friend. Please try again.');
    }
  };
  
  // ============ Event Invitation Functions ============
  
  // Invite friend to current event
  const handleInviteFriendToEvent = async (friend: UserProfile) => {
    if (!currentUser || !event) return;
    
    // Check if already a member
    if (event.members.some(m => m.id === friend.id)) {
      alert(`${friend.name} is already a member of this event.`);
      return;
    }
    
    const invitation: EventInvitation = {
      id: Math.random().toString(36).substr(2, 9),
      eventId: event.id,
      eventTitle: event.title,
      fromUserId: currentUser.id,
      fromUserName: currentUser.name,
      toUserId: friend.id,
      toUserEmail: friend.email,
      status: 'pending',
      createdAt: Date.now()
    };
    
    try {
      await sendEventInvitation(invitation);
      alert(`Invitation sent to ${friend.name}!`);
    } catch (error) {
      console.error('Failed to send invitation:', error);
      alert('Failed to send invitation. Please try again.');
    }
  };
  
  // Accept event invitation
  const handleAcceptEventInvitation = async (invitation: EventInvitation) => {
    if (!currentUser) return;
    
    try {
      // Get the event
      const eventToJoin = await getEvent(invitation.eventId);
      if (!eventToJoin) {
        alert('Event not found. It may have been deleted.');
        await updateEventInvitationStatus(invitation.id, 'rejected');
        return;
      }
      
      // Add user to event
      const userForEvent: User = {
        id: currentUser.id,
        name: currentUser.name,
        role: 'Member',
        email: currentUser.email,
        photoURL: currentUser.photoURL
      };
      
      const updatedEvent = {
        ...eventToJoin,
        members: [...eventToJoin.members, userForEvent],
        messages: [
          ...eventToJoin.messages,
          {
            id: `sys-invite-accept-${Date.now()}`,
            userId: 'system',
            userName: 'SyncUp',
            text: `${currentUser.name} joined via invitation`,
            timestamp: Date.now(),
            isSystem: true
          }
        ]
      };
      
      await saveEvent(updatedEvent);
      await updateEventInvitationStatus(invitation.id, 'accepted');
      
      // Add to local events and switch to it
      setEvents(prev => {
        const exists = prev.some(e => e.id === invitation.eventId);
        if (exists) {
          return prev.map(e => e.id === invitation.eventId ? updatedEvent : e);
        }
        return [...prev, updatedEvent];
      });
      
      setCurrentEventId(invitation.eventId);
      alert(`You have joined "${invitation.eventTitle}"!`);
    } catch (error) {
      console.error('Failed to accept invitation:', error);
      alert('Failed to join event. Please try again.');
    }
  };
  
  // Reject event invitation
  const handleRejectEventInvitation = async (invitation: EventInvitation) => {
    try {
      await updateEventInvitationStatus(invitation.id, 'rejected');
    } catch (error) {
      console.error('Failed to reject invitation:', error);
    }
  };

  // Check for invite link on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('join');
    
    if (eventId && !showJoinForm) {
      setInviteEventId(eventId);
      setShowJoinForm(true);
      
      // Try to fetch event from Firebase
      const fetchEventFromFirebase = async () => {
        try {
          const firebaseEvent = await getEvent(eventId);
          if (firebaseEvent) {
            // Event exists in Firebase, add it to local state if not already there
            setEvents(prev => {
              const exists = prev.some(e => e.id === eventId);
              if (!exists) {
                return [...prev, firebaseEvent];
              }
              return prev;
            });
          }
        } catch (error) {
          console.error('Failed to fetch event from Firebase:', error);
        }
      };
      
      fetchEventFromFirebase();
    }
  }, [showJoinForm]);

  // Get current event
  const event = events.find(e => e.id === currentEventId) || null;

  // Debounced save to Firebase - waits for user to stop editing before saving
  const debouncedSaveToFirebase = useCallback((eventToSave: EventData) => {
    // Clear any existing timeout
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
    }
    
    // Mark that we're editing
    isLocalEditingRef.current = true;
    lastLocalEditTimeRef.current = Date.now();
    
    // Set new timeout - save after 500ms of no changes
    saveDebounceRef.current = setTimeout(async () => {
      isLocalEditingRef.current = false;
      try {
        await saveEvent(eventToSave);
        console.log('Debounced save completed');
      } catch (error) {
        console.error('Failed to save event:', error);
      }
    }, 500);
  }, []);

  // Update current event helper with debounced Firebase save
  const updateCurrentEvent = useCallback((updater: (prev: EventData) => EventData) => {
    setEvents(prevEvents => {
      let updatedEvent: EventData | null = null;
      const newEvents = prevEvents.map(e => {
        if (e.id === currentEventId) {
          updatedEvent = updater(e);
          return updatedEvent;
        }
        return e;
      });
      
      // Debounced save to Firebase
      if (updatedEvent) {
        debouncedSaveToFirebase(updatedEvent);
      }
      
      return newEvents;
    });
  }, [currentEventId, debouncedSaveToFirebase]);

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
    
    // Save to Firebase
    saveEventToFirebase(newEvent);
  };

  // Delete event
  const handleDeleteEvent = async (eventId: string) => {
    // Delete from Firebase
    try {
      const { deleteEvent } = await import('./services/firebase');
      await deleteEvent(eventId);
    } catch (error) {
      console.error('Failed to delete event from Firebase:', error);
    }
    
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

  // Leave event (for current user)
  const handleLeaveEvent = async () => {
    if (!event || !currentUser) return;
    
    // Creator cannot leave their own event
    if (currentUser.id === event.creatorId) {
      alert("As the creator, you cannot leave this event. You can delete it instead.");
      return;
    }
    
    if (!confirm(`Are you sure you want to leave "${event.title}"?`)) {
      return;
    }
    
    const updatedEvent = {
      ...event,
      members: event.members.filter(m => m.id !== currentUser.id),
      slots: event.slots.map(slot => ({
        ...slot,
        availableUsers: slot.availableUsers.filter(id => id !== currentUser.id)
      })),
      messages: [
        ...event.messages,
        {
          id: `sys-leave-${Date.now()}`,
          userId: 'system',
          userName: 'SyncUp',
          text: `${currentUser.name} left the event`,
          timestamp: Date.now(),
          isSystem: true
        }
      ]
    };
    
    // Save to Firebase
    try {
      await saveEvent(updatedEvent);
    } catch (error) {
      console.error('Failed to save event:', error);
    }
    
    // Remove from local events and go to event list
    setEvents(prev => prev.filter(e => e.id !== event.id));
    setCurrentEventId(null);
    setShowEventMenu(false);
  };

  // Join event via invite link
  const handleJoinViaLink = async (memberData: { name: string; badge?: string }) => {
    if (!inviteEventId) return;
    
    const targetEvent = events.find(e => e.id === inviteEventId);
    if (!targetEvent) {
      alert("Event not found. The link may be invalid or the event was deleted.");
      setShowJoinForm(false);
      setInviteEventId(null);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    
    // If user is already logged in, use their existing identity
    if (currentUser && isLoggedIn) {
      // Check if this user is already in this event (by ID)
      const existingMemberById = targetEvent.members.find(m => m.id === currentUser.id);
      if (existingMemberById) {
        // Already a member, just switch to the event
        setCurrentEventId(inviteEventId);
        setShowJoinForm(false);
        setInviteEventId(null);
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
      
      // Add existing user to this event
      const userForEvent: User = {
        ...currentUser,
        role: 'Member', // Always join as Member via invite link
        badge: memberData.badge || currentUser.badge
      };
      
      const updatedEvent = {
        ...targetEvent,
        members: [...targetEvent.members, userForEvent],
        messages: [
          ...targetEvent.messages,
          {
            id: `sys-join-${Date.now()}`,
            userId: 'system',
            userName: 'SyncUp',
            text: `${userForEvent.badge ? userForEvent.badge + ' ' : ''}${userForEvent.name} joined via invite link`,
            timestamp: Date.now(),
            isSystem: true
          }
        ]
      };
      
      // Save to Firebase FIRST, then update local state
      try {
        await saveEvent(updatedEvent);
        console.log('Event saved to Firebase successfully');
      } catch (error) {
        console.error('Failed to save event to Firebase:', error);
      }
      
      setEvents(prev => {
        const exists = prev.some(e => e.id === inviteEventId);
        if (exists) {
          return prev.map(e => e.id === inviteEventId ? updatedEvent : e);
        }
        return [...prev, updatedEvent];
      });
      
      setCurrentEventId(inviteEventId);
      setShowJoinForm(false);
      setInviteEventId(null);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    
    // Not logged in - check if user with same name already exists in this event
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
    
    // Create new user and add to event
    const newMember: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: memberData.name,
      role: 'Member',
      badge: memberData.badge
    };
    
    const updatedEvent = {
      ...targetEvent,
      members: [...targetEvent.members, newMember],
      messages: [
        ...targetEvent.messages,
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
    
    // Save to Firebase FIRST, then update local state
    try {
      await saveEvent(updatedEvent);
      console.log('Event saved to Firebase successfully');
    } catch (error) {
      console.error('Failed to save event to Firebase:', error);
    }
    
    setEvents(prev => {
      const exists = prev.some(e => e.id === inviteEventId);
      if (exists) {
        return prev.map(e => e.id === inviteEventId ? updatedEvent : e);
      }
      return [...prev, updatedEvent];
    });
    
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

  // Batch toggle availability - more efficient for drag/multi-select operations
  const handleBatchToggleAvailability = useCallback((updates: Array<{ date: string; time: string; isAvailable: boolean }>) => {
    if (!event || !currentUser || updates.length === 0) return;
    
    // Filter out conflicts for 'select' operations
    const validUpdates = updates.filter(update => {
      if (update.isAvailable) {
        const conflict = calendarEvents.find((e: CalendarEvent) => e.startTime === update.time);
        return !conflict;
      }
      return true;
    });
    
    if (validUpdates.length === 0) return;
    
    // Apply all updates in a single state update
    updateCurrentEvent(prev => ({
      ...prev,
      slots: prev.slots.map((slot: AvailabilitySlot) => {
        const update = validUpdates.find(u => u.date === slot.date && u.time === slot.time);
        if (update) {
          const newUserList = update.isAvailable 
            ? (slot.availableUsers.includes(currentUser.id) ? slot.availableUsers : [...slot.availableUsers, currentUser.id])
            : slot.availableUsers.filter((id: string) => id !== currentUser.id);
          return { ...slot, availableUsers: newUserList };
        }
        return slot;
      })
    }));
  }, [event, currentUser, calendarEvents, updateCurrentEvent]);

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

  // Get user's role in current event (not their global role)
  const memberInCurrentEvent = event?.members.find(m => m.id === currentUser?.id);
  const roleInCurrentEvent = memberInCurrentEvent?.role || currentUser?.role;
  const canEdit = !!(currentUser && (roleInCurrentEvent === 'Director' || roleInCurrentEvent === 'Co-manager'));

  // Show join form if accessing via invite link
  if (showJoinForm && inviteEventId) {
    const inviteEvent = events.find(e => e.id === inviteEventId);
    const alreadyMember = inviteEvent && currentUser && inviteEvent.members.some(m => m.id === currentUser.id);
    
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
              
              {/* If user is already logged in, show quick join */}
              {currentUser && isLoggedIn ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                    <p className="text-sm text-green-800">
                      <span className="font-bold">Logged in as:</span> {currentUser.name}
                    </p>
                    {alreadyMember && (
                      <p className="text-xs text-green-600 mt-1">You're already a member of this event!</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowJoinForm(false);
                        setInviteEventId(null);
                        window.history.replaceState({}, '', window.location.pathname);
                      }}
                      className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleJoinViaLink({ name: currentUser.name, badge: currentUser.badge })}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-bold"
                    >
                      {alreadyMember ? 'Go to Event' : 'Join Event'}
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      handleLogout();
                    }}
                    className="w-full text-gray-500 text-sm hover:text-gray-700"
                  >
                    Join as different user
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Google Login Option */}
                  <button
                    onClick={async () => {
                      await handleGoogleLogin();
                      // After Google login, the auth state change will update currentUser
                      // The UI will then show the "quick join" option
                    }}
                    className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Join with Google
                  </button>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-200"></div>
                    <span className="text-gray-400 text-sm">or</span>
                    <div className="flex-1 h-px bg-gray-200"></div>
                  </div>
                  
                  {/* Manual Name Join */}
                  <JoinEventForm onSubmit={handleJoinViaLink} onCancel={() => {
                    setShowJoinForm(false);
                    setInviteEventId(null);
                    window.history.replaceState({}, '', window.location.pathname);
                  }} />
                </div>
              )}
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

  // Show loading state
  if (isLoading && isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center max-w-md mx-auto">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading your events...</p>
        </div>
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
                
                {/* Google Login Button */}
                <button
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors mb-4"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>
                
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-200"></div>
                  <span className="text-gray-400 text-sm">or</span>
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>
                
                {/* Manual Name Login */}
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
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 py-4 rounded-2xl font-bold text-lg hover:bg-gray-100 transition-colors shadow-lg"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>
                <button
                  onClick={() => setShowLoginForm(true)}
                  className="w-full bg-white/20 text-white py-3 rounded-2xl font-medium hover:bg-white/30 transition-colors"
                >
                  Continue with Name
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
            <div className="flex items-center gap-3">
              {currentUser.photoURL ? (
                <img 
                  src={currentUser.photoURL} 
                  alt={currentUser.name} 
                  className="w-10 h-10 rounded-full border-2 border-indigo-100"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-xl font-black text-indigo-600 tracking-tighter">SyncUp</h1>
                <p className="text-gray-600 text-xs">{currentUser.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Friends Button with notification badge */}
              <button
                onClick={() => setShowFriendsModal(true)}
                className="relative p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Friends"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {(friendRequests.length + eventInvitations.length) > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {friendRequests.length + eventInvitations.length}
                  </span>
                )}
              </button>
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1 rounded-full border border-gray-200 hover:border-gray-300"
              >
                Logout
              </button>
            </div>
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

        {/* Friends Modal */}
        {showFriendsModal && (
          <FriendsModal
            friends={friends}
            friendRequests={friendRequests}
            eventInvitations={eventInvitations}
            onClose={() => setShowFriendsModal(false)}
            onAddFriend={() => {
              setShowFriendsModal(false);
              setShowAddFriendModal(true);
            }}
            onAcceptFriendRequest={handleAcceptFriendRequest}
            onRejectFriendRequest={handleRejectFriendRequest}
            onRemoveFriend={handleRemoveFriend}
            onAcceptEventInvitation={handleAcceptEventInvitation}
            onRejectEventInvitation={handleRejectEventInvitation}
          />
        )}

        {/* Add Friend Modal */}
        {showAddFriendModal && (
          <AddFriendModal
            onClose={() => setShowAddFriendModal(false)}
            onSendRequest={handleSendFriendRequest}
          />
        )}
      </div>
    );
  }

  // Safety check - if event not found, show loading or redirect to event list
  if (!event) {
    // If we have a currentEventId but event not found, try to fetch it
    if (currentEventId) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center max-w-md mx-auto">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 font-medium">Loading event...</p>
          </div>
        </div>
      );
    }
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
          <div className="flex items-center gap-2">
             {(() => {
               // Get user's role in THIS event (not their global role)
               const memberInEvent = event.members.find(m => m.id === currentUser.id);
               const roleInEvent = memberInEvent?.role || currentUser.role;
               return (
                 <div className="bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 flex items-center space-x-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest">{roleInEvent}</span>
                 </div>
               );
             })()}
             {/* Friends Button with notification badge */}
             <button
               onClick={() => setShowFriendsModal(true)}
               className="relative p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
               title="Friends"
             >
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
               </svg>
               {(friendRequests.length + eventInvitations.length) > 0 && (
                 <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                   {friendRequests.length + eventInvitations.length}
                 </span>
               )}
             </button>
             {/* Event Menu Button */}
             <div className="relative">
               <button
                 onClick={() => setShowEventMenu(!showEventMenu)}
                 className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
               >
                 <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                   <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                 </svg>
               </button>
               
               {/* Dropdown Menu */}
               {showEventMenu && (
                 <>
                 {/* Overlay to close menu */}
                 <div 
                   className="fixed inset-0 z-40" 
                   onClick={() => setShowEventMenu(false)}
                 />
                 <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                   <button
                     onClick={handleCopyInviteLink}
                     className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                   >
                     🔗 Copy Invite Link
                   </button>
                   {friends.length > 0 && (
                     <button
                       onClick={() => {
                         setShowInviteFriendsModal(true);
                         setShowEventMenu(false);
                       }}
                       className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                     >
                       📨 Invite Friends
                     </button>
                   )}
                   {canEdit && (
                     <button
                       onClick={() => {
                         setShowMemberManager(true);
                         setShowEventMenu(false);
                       }}
                       className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                     >
                       👥 Manage Members
                     </button>
                   )}
                   <div className="h-px bg-gray-100 my-1"></div>
                   {currentUser?.id !== event.creatorId ? (
                     <button
                       onClick={handleLeaveEvent}
                       className="w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                     >
                       🚪 Leave Event
                     </button>
                   ) : (
                     <button
                       onClick={() => {
                         if (confirm(`Delete "${event.title}"? This cannot be undone.`)) {
                           handleDeleteEvent(event.id);
                           setShowEventMenu(false);
                         }
                       }}
                       className="w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                     >
                       🗑️ Delete Event
                     </button>
                   )}
                 </div>
                 </>
               )}
             </div>
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
              onBatchToggle={handleBatchToggleAvailability}
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

      {/* Friends Modal */}
      {showFriendsModal && (
        <FriendsModal
          friends={friends}
          friendRequests={friendRequests}
          eventInvitations={eventInvitations}
          onClose={() => setShowFriendsModal(false)}
          onAddFriend={() => {
            setShowFriendsModal(false);
            setShowAddFriendModal(true);
          }}
          onAcceptFriendRequest={handleAcceptFriendRequest}
          onRejectFriendRequest={handleRejectFriendRequest}
          onRemoveFriend={handleRemoveFriend}
          onAcceptEventInvitation={handleAcceptEventInvitation}
          onRejectEventInvitation={handleRejectEventInvitation}
          onInviteToEvent={() => {
            setShowFriendsModal(false);
            setShowInviteFriendsModal(true);
          }}
          hasCurrentEvent={true}
        />
      )}

      {/* Add Friend Modal */}
      {showAddFriendModal && (
        <AddFriendModal
          onClose={() => setShowAddFriendModal(false)}
          onSendRequest={handleSendFriendRequest}
        />
      )}

      {/* Invite Friends to Event Modal */}
      {showInviteFriendsModal && event && (
        <InviteFriendsModal
          friends={friends}
          eventMembers={event.members}
          onClose={() => setShowInviteFriendsModal(false)}
          onInvite={handleInviteFriendToEvent}
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

// Friends Modal Component
const FriendsModal: React.FC<{
  friends: UserProfile[];
  friendRequests: FriendRequest[];
  eventInvitations: EventInvitation[];
  onClose: () => void;
  onAddFriend: () => void;
  onAcceptFriendRequest: (request: FriendRequest) => void;
  onRejectFriendRequest: (request: FriendRequest) => void;
  onRemoveFriend: (friendId: string) => void;
  onAcceptEventInvitation: (invitation: EventInvitation) => void;
  onRejectEventInvitation: (invitation: EventInvitation) => void;
  onInviteToEvent?: () => void;
  hasCurrentEvent?: boolean;
}> = ({ 
  friends, friendRequests, eventInvitations, onClose, onAddFriend,
  onAcceptFriendRequest, onRejectFriendRequest, onRemoveFriend,
  onAcceptEventInvitation, onRejectEventInvitation, onInviteToEvent, hasCurrentEvent
}) => {
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'invitations'>('friends');
  
  const totalNotifications = friendRequests.length + eventInvitations.length;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-900 text-lg">Friends</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'friends' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Friends ({friends.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors relative ${
              activeTab === 'requests' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Requests
            {friendRequests.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-rose-500 text-white text-[10px] rounded-full">
                {friendRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'invitations' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Events
            {eventInvitations.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-rose-500 text-white text-[10px] rounded-full">
                {eventInvitations.length}
              </span>
            )}
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'friends' && (
            <div className="space-y-2">
              {friends.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-2">👥</div>
                  <p className="text-gray-500 text-sm">No friends yet</p>
                  <p className="text-gray-400 text-xs mt-1">Add friends to invite them to events!</p>
                </div>
              ) : (
                friends.map(friend => (
                  <div key={friend.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      {friend.photoURL ? (
                        <img src={friend.photoURL} alt={friend.name} className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                          {friend.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{friend.name}</p>
                        <p className="text-xs text-gray-500">{friend.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveFriend(friend.id)}
                      className="text-gray-400 hover:text-rose-500 p-1"
                      title="Remove friend"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          
          {activeTab === 'requests' && (
            <div className="space-y-2">
              {friendRequests.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-2">📬</div>
                  <p className="text-gray-500 text-sm">No pending friend requests</p>
                </div>
              ) : (
                friendRequests.map(request => (
                  <div key={request.id} className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                    <div className="flex items-center gap-3 mb-3">
                      {request.fromUserPhoto ? (
                        <img src={request.fromUserPhoto} alt={request.fromUserName} className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-600 font-bold">
                          {request.fromUserName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{request.fromUserName}</p>
                        <p className="text-xs text-gray-500">{request.fromUserEmail}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onRejectFriendRequest(request)}
                        className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => onAcceptFriendRequest(request)}
                        className="flex-1 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          
          {activeTab === 'invitations' && (
            <div className="space-y-2">
              {eventInvitations.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-2">📅</div>
                  <p className="text-gray-500 text-sm">No pending event invitations</p>
                </div>
              ) : (
                eventInvitations.map(invitation => (
                  <div key={invitation.id} className="p-3 bg-green-50 rounded-xl border border-green-100">
                    <p className="text-xs text-green-600 font-medium mb-1">Event Invitation</p>
                    <p className="font-bold text-gray-900">{invitation.eventTitle}</p>
                    <p className="text-xs text-gray-500 mt-1">From: {invitation.fromUserName}</p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => onRejectEventInvitation(invitation)}
                        className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => onAcceptEventInvitation(invitation)}
                        className="flex-1 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700"
                      >
                        Join Event
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
          <button
            onClick={onAddFriend}
            className="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"
          >
            + Add Friend
          </button>
          {hasCurrentEvent && onInviteToEvent && (
            <button
              onClick={onInviteToEvent}
              className="flex-1 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700"
            >
              Invite to Event
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Add Friend Modal Component
const AddFriendModal: React.FC<{
  onClose: () => void;
  onSendRequest: (email: string) => void;
}> = ({ onClose, onSendRequest }) => {
  const [email, setEmail] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    onSendRequest(email.trim());
    onClose();
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-900">Add Friend</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        
        <p className="text-sm text-gray-600 mb-4">
          Enter your friend's Gmail address to send them a friend request.
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@gmail.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              required
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"
            >
              Send Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Invite Friends to Event Modal
const InviteFriendsModal: React.FC<{
  friends: UserProfile[];
  eventMembers: User[];
  onClose: () => void;
  onInvite: (friend: UserProfile) => void;
}> = ({ friends, eventMembers, onClose, onInvite }) => {
  const availableFriends = friends.filter(f => !eventMembers.some(m => m.id === f.id));
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-900">Invite Friends</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {availableFriends.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-gray-500 text-sm">All your friends are already in this event!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {availableFriends.map(friend => (
                <div key={friend.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    {friend.photoURL ? (
                      <img src={friend.photoURL} alt={friend.name} className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                        {friend.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{friend.name}</p>
                      <p className="text-xs text-gray-500">{friend.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onInvite(friend)}
                    className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
                  >
                    Invite
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <button
          onClick={onClose}
          className="mt-4 py-2 w-full border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50"
        >
          Done
        </button>
      </div>
    </div>
  );
};

export default App;
