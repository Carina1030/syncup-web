/**
 * Google Calendar OAuth 2.0 Authentication Service
 * 
 * Setup Instructions:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a new project or select existing one
 * 3. Enable Google Calendar API
 * 4. Create OAuth 2.0 credentials (Web application)
 * 5. Add your domain to authorized JavaScript origins
 * 6. Copy Client ID and add to .env.local as GOOGLE_CLIENT_ID
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'];
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

let gapiLoaded = false;
let gisLoaded = false;

/**
 * Load Google API script
 */
export function loadGoogleAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (gapiLoaded && gisLoaded) {
      resolve();
      return;
    }

    // Load gapi (Google API client)
    if (!gapiLoaded) {
      const gapiScript = document.createElement('script');
      gapiScript.src = 'https://apis.google.com/js/api.js';
      gapiScript.onload = () => {
        gapiLoaded = true;
        window.gapi.load('client', () => {
          if (gisLoaded) resolve();
        });
      };
      gapiScript.onerror = () => reject(new Error('Failed to load Google API'));
      document.head.appendChild(gapiScript);
    }

    // Load gis (Google Identity Services)
    if (!gisLoaded) {
      const gisScript = document.createElement('script');
      gisScript.src = 'https://accounts.google.com/gsi/client';
      gisScript.onload = () => {
        gisLoaded = true;
        if (gapiLoaded) resolve();
      };
      gisScript.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(gisScript);
    }
  });
}

/**
 * Initialize Google API client
 */
export async function initializeGoogleAPI(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in .env.local');
  }

  await loadGoogleAPI();
  
  await window.gapi.client.init({
    apiKey: GOOGLE_API_KEY,
    clientId: GOOGLE_CLIENT_ID,
    discoveryDocs: DISCOVERY_DOCS,
    scope: SCOPES,
  });
}

/**
 * Check if user is signed in
 */
export function isSignedIn(): boolean {
  return window.gapi?.auth2?.getAuthInstance()?.isSignedIn?.get() || false;
}

/**
 * Get current user's access token
 */
export function getAccessToken(): string | null {
  const authInstance = window.gapi?.auth2?.getAuthInstance();
  if (!authInstance || !authInstance.isSignedIn.get()) {
    return null;
  }
  return authInstance.currentUser.get().getAuthResponse().access_token;
}

/**
 * Sign in user with Google Calendar
 */
export async function signIn(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google Client ID is not configured');
  }

  await loadGoogleAPI();

  return new Promise((resolve, reject) => {
    window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: async (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        try {
          await initializeGoogleAPI();
          resolve();
        } catch (error) {
          reject(error);
        }
      },
    }).requestAccessToken();
  });
}

/**
 * Sign out user
 */
export async function signOut(): Promise<void> {
  const authInstance = window.gapi?.auth2?.getAuthInstance();
  if (authInstance) {
    await authInstance.signOut();
  }
  
  // Clear token from Google Identity Services
  if (window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke('', () => {});
  }
}

/**
 * Get user's email
 */
export function getUserEmail(): string | null {
  const authInstance = window.gapi?.auth2?.getAuthInstance();
  if (!authInstance || !authInstance.isSignedIn.get()) {
    return null;
  }
  return authInstance.currentUser.get().getBasicProfile().getEmail();
}

// Type declarations for Google API
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}
