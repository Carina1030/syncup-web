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
import { EventData } from "../types";

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

// Get all events for a user (by member ID)
export async function getUserEvents(userId: string): Promise<EventData[]> {
  try {
    const querySnapshot = await getDocs(eventsCollection);
    const events: EventData[] = [];
    
    querySnapshot.forEach((doc) => {
      const event = doc.data() as EventData;
      // Check if user is a member of this event
      if (event.members.some(m => m.id === userId)) {
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

export { db };
