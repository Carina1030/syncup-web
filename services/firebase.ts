import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs
} from "firebase/firestore";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import { EventData, UserProfile, FriendRequest, EventInvitation } from "../types";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC9MLVi04RLqCJ2i2LiuAgM7ajN1iFC3ac",
  authDomain: "syncup-787b3.firebaseapp.com",
  projectId: "syncup-787b3",
  storageBucket: "syncup-787b3.firebasestorage.app",
  messagingSenderId: "949798976845",
  appId: "1:949798976845:web:2233b027b0785698ed0b04",
  measurementId: "G-55EYR96PX5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// ============ Authentication Functions ============

// Sign in with Google
export async function signInWithGoogle(): Promise<FirebaseUser | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log("Google sign in successful:", result.user.email);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
}

// Sign out
export async function signOutUser(): Promise<void> {
  try {
    await signOut(auth);
    console.log("User signed out");
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
}

// Subscribe to auth state changes
export function subscribeToAuthState(
  callback: (user: FirebaseUser | null) => void
): () => void {
  return onAuthStateChanged(auth, callback);
}

// Get current user
export function getCurrentUser(): FirebaseUser | null {
  return auth.currentUser;
}

// Collection reference
const eventsCollection = collection(db, "events");

// Save event to Firestore
export async function saveEvent(event: EventData): Promise<void> {
  try {
    const eventRef = doc(db, "events", event.id);
    await setDoc(eventRef, event);
    console.log("Event saved to Firebase:", event.id);
  } catch (error) {
    console.error("Error saving event to Firebase:", error);
    throw error;
  }
}

// Get event from Firestore
export async function getEvent(eventId: string): Promise<EventData | null> {
  try {
    const eventRef = doc(db, "events", eventId);
    const eventSnap = await getDoc(eventRef);
    
    if (eventSnap.exists()) {
      return eventSnap.data() as EventData;
    }
    return null;
  } catch (error) {
    console.error("Error getting event from Firebase:", error);
    return null;
  }
}

// Update event in Firestore
export async function updateEvent(eventId: string, updates: Partial<EventData>): Promise<void> {
  try {
    const eventRef = doc(db, "events", eventId);
    await updateDoc(eventRef, updates);
    console.log("Event updated in Firebase:", eventId);
  } catch (error) {
    console.error("Error updating event in Firebase:", error);
    throw error;
  }
}

// Delete event from Firestore
export async function deleteEvent(eventId: string): Promise<void> {
  try {
    const eventRef = doc(db, "events", eventId);
    await deleteDoc(eventRef);
    console.log("Event deleted from Firebase:", eventId);
  } catch (error) {
    console.error("Error deleting event from Firebase:", error);
    throw error;
  }
}

// Subscribe to event changes (real-time updates)
export function subscribeToEvent(
  eventId: string, 
  callback: (event: EventData | null) => void
): () => void {
  const eventRef = doc(db, "events", eventId);
  
  const unsubscribe = onSnapshot(eventRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as EventData);
    } else {
      callback(null);
    }
  }, (error) => {
    console.error("Error subscribing to event:", error);
    callback(null);
  });
  
  return unsubscribe;
}

// Get all events for a user (by member ID or name)
export async function getUserEvents(userId: string, userName?: string): Promise<EventData[]> {
  try {
    const querySnapshot = await getDocs(eventsCollection);
    const events: EventData[] = [];
    
    querySnapshot.forEach((doc) => {
      const event = doc.data() as EventData;
      // Check if user is a member of this event (by ID or name)
      const isMember = event.members.some(m => 
        m.id === userId || (userName && m.name === userName)
      );
      if (isMember) {
        events.push(event);
      }
    });
    
    return events;
  } catch (error) {
    console.error("Error getting user events from Firebase:", error);
    return [];
  }
}

// Subscribe to all events (for admin/debugging)
export function subscribeToAllEvents(
  callback: (events: EventData[]) => void
): () => void {
  const unsubscribe = onSnapshot(eventsCollection, (snapshot) => {
    const events: EventData[] = [];
    snapshot.forEach((doc) => {
      events.push(doc.data() as EventData);
    });
    callback(events);
  }, (error) => {
    console.error("Error subscribing to events:", error);
    callback([]);
  });
  
  return unsubscribe;
}

// ============ User Profile Functions ============

// Save or update user profile
export async function saveUserProfile(profile: UserProfile): Promise<void> {
  try {
    const profileRef = doc(db, "users", profile.id);
    await setDoc(profileRef, profile, { merge: true });
    console.log("User profile saved:", profile.email);
  } catch (error) {
    console.error("Error saving user profile:", error);
    throw error;
  }
}

// Get user profile by ID
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const profileRef = doc(db, "users", userId);
    const profileSnap = await getDoc(profileRef);
    if (profileSnap.exists()) {
      return profileSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error("Error getting user profile:", error);
    return null;
  }
}

// Find user by email
export async function findUserByEmail(email: string): Promise<UserProfile | null> {
  try {
    const usersCollection = collection(db, "users");
    const q = query(usersCollection, where("email", "==", email.toLowerCase()));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error("Error finding user by email:", error);
    return null;
  }
}

// ============ Friend Request Functions ============

// Send friend request
export async function sendFriendRequest(request: FriendRequest): Promise<void> {
  try {
    const requestRef = doc(db, "friendRequests", request.id);
    await setDoc(requestRef, request);
    console.log("Friend request sent to:", request.toUserEmail);
  } catch (error) {
    console.error("Error sending friend request:", error);
    throw error;
  }
}

// Get pending friend requests for a user (by email)
export async function getPendingFriendRequests(userEmail: string): Promise<FriendRequest[]> {
  try {
    const requestsCollection = collection(db, "friendRequests");
    const q = query(
      requestsCollection, 
      where("toUserEmail", "==", userEmail.toLowerCase())
    );
    const querySnapshot = await getDocs(q);
    
    const requests: FriendRequest[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as FriendRequest;
      if (data.status === 'pending') {
        requests.push(data);
      }
    });
    return requests;
  } catch (error) {
    console.error("Error getting friend requests:", error);
    return [];
  }
}

// Update friend request status
export async function updateFriendRequestStatus(
  requestId: string, 
  status: 'accepted' | 'rejected'
): Promise<void> {
  try {
    const requestRef = doc(db, "friendRequests", requestId);
    await updateDoc(requestRef, { status });
    console.log("Friend request updated:", requestId, status);
  } catch (error) {
    console.error("Error updating friend request:", error);
    throw error;
  }
}

// Add friend to user's friend list
export async function addFriend(userId: string, friendId: string): Promise<void> {
  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data() as UserProfile;
      const friends = userData.friends || [];
      if (!friends.includes(friendId)) {
        friends.push(friendId);
        await updateDoc(userRef, { friends });
      }
    }
  } catch (error) {
    console.error("Error adding friend:", error);
    throw error;
  }
}

// Get user's friends
export async function getUserFriends(userId: string): Promise<UserProfile[]> {
  try {
    const userProfile = await getUserProfile(userId);
    if (!userProfile || !userProfile.friends || userProfile.friends.length === 0) {
      return [];
    }
    
    const friends: UserProfile[] = [];
    for (const friendId of userProfile.friends) {
      const friendProfile = await getUserProfile(friendId);
      if (friendProfile) {
        friends.push(friendProfile);
      }
    }
    return friends;
  } catch (error) {
    console.error("Error getting user friends:", error);
    return [];
  }
}

// Remove friend
export async function removeFriend(userId: string, friendId: string): Promise<void> {
  try {
    // Remove from user's friend list
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data() as UserProfile;
      const friends = (userData.friends || []).filter(id => id !== friendId);
      await updateDoc(userRef, { friends });
    }
    
    // Also remove from friend's list (mutual unfriend)
    const friendRef = doc(db, "users", friendId);
    const friendSnap = await getDoc(friendRef);
    if (friendSnap.exists()) {
      const friendData = friendSnap.data() as UserProfile;
      const friendFriends = (friendData.friends || []).filter(id => id !== userId);
      await updateDoc(friendRef, { friends: friendFriends });
    }
  } catch (error) {
    console.error("Error removing friend:", error);
    throw error;
  }
}

// ============ Event Invitation Functions ============

// Send event invitation to a friend
export async function sendEventInvitation(invitation: EventInvitation): Promise<void> {
  try {
    const inviteRef = doc(db, "eventInvitations", invitation.id);
    await setDoc(inviteRef, invitation);
    console.log("Event invitation sent:", invitation.id);
  } catch (error) {
    console.error("Error sending event invitation:", error);
    throw error;
  }
}

// Get pending event invitations for a user
export async function getPendingEventInvitations(userId: string): Promise<EventInvitation[]> {
  try {
    const invitesCollection = collection(db, "eventInvitations");
    const q = query(
      invitesCollection, 
      where("toUserId", "==", userId)
    );
    const querySnapshot = await getDocs(q);
    
    const invitations: EventInvitation[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as EventInvitation;
      if (data.status === 'pending') {
        invitations.push(data);
      }
    });
    return invitations;
  } catch (error) {
    console.error("Error getting event invitations:", error);
    return [];
  }
}

// Update event invitation status
export async function updateEventInvitationStatus(
  invitationId: string, 
  status: 'accepted' | 'rejected'
): Promise<void> {
  try {
    const inviteRef = doc(db, "eventInvitations", invitationId);
    await updateDoc(inviteRef, { status });
    console.log("Event invitation updated:", invitationId, status);
  } catch (error) {
    console.error("Error updating event invitation:", error);
    throw error;
  }
}

// Subscribe to user's event invitations (real-time)
// Checks both by userId and by email (for invites sent before user signed up)
export function subscribeToEventInvitations(
  userId: string,
  callback: (invitations: EventInvitation[]) => void,
  userEmail?: string
): () => void {
  try {
    const invitesCollection = collection(db, "eventInvitations");
    const cleanups: Array<() => void> = [];
    let invitationsByUserId: EventInvitation[] = [];
    let invitationsByEmail: EventInvitation[] = [];
    
    const mergeAndCallback = () => {
      const seen = new Set<string>();
      const merged: EventInvitation[] = [];
      for (const inv of [...invitationsByUserId, ...invitationsByEmail]) {
        if (!seen.has(inv.id) && inv.status === 'pending') {
          seen.add(inv.id);
          merged.push(inv);
        }
      }
      callback(merged);
    };
    
    // Query by userId
    const q1 = query(invitesCollection, where("toUserId", "==", userId));
    const unsub1 = onSnapshot(q1, (snapshot) => {
      invitationsByUserId = [];
      snapshot.forEach((doc) => {
        invitationsByUserId.push(doc.data() as EventInvitation);
      });
      mergeAndCallback();
    }, (error) => {
      console.error("Error subscribing to invitations by userId:", error);
    });
    cleanups.push(unsub1);
    
    // Also query by email if available
    if (userEmail) {
      const q2 = query(invitesCollection, where("toUserEmail", "==", userEmail.toLowerCase()));
      const unsub2 = onSnapshot(q2, (snapshot) => {
        invitationsByEmail = [];
        snapshot.forEach((doc) => {
          invitationsByEmail.push(doc.data() as EventInvitation);
        });
        mergeAndCallback();
      }, (error) => {
        console.error("Error subscribing to invitations by email:", error);
      });
      cleanups.push(unsub2);
    }
    
    return () => cleanups.forEach(fn => fn());
  } catch (error) {
    console.error("Error setting up invitation subscription:", error);
    callback([]);
    return () => {};
  }
}

// Subscribe to friend requests (real-time)
// Falls back to single-field query if composite index is missing
export function subscribeToFriendRequests(
  userEmail: string,
  callback: (requests: FriendRequest[]) => void
): () => void {
  try {
    const requestsCollection = collection(db, "friendRequests");
    // Use single where clause to avoid requiring composite index
    const q = query(
      requestsCollection, 
      where("toUserEmail", "==", userEmail.toLowerCase())
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requests: FriendRequest[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as FriendRequest;
        // Filter pending status client-side
        if (data.status === 'pending') {
          requests.push(data);
        }
      });
      callback(requests);
    }, (error) => {
      console.error("Error subscribing to friend requests:", error);
      callback([]);
    });
    
    return unsubscribe;
  } catch (error) {
    console.error("Error setting up friend request subscription:", error);
    callback([]);
    return () => {};
  }
}

export { db, auth };
