/**
 * Apple Calendar (iCloud) Integration via CalDAV
 * 
 * Apple Calendar uses CalDAV protocol. To connect:
 * 1. Get your iCloud CalDAV credentials
 * 2. Use CalDAV server URL: https://caldav.icloud.com
 * 3. Authenticate with your Apple ID
 * 
 * Note: For security, you may need a backend server to handle CalDAV requests
 * due to CORS restrictions. This implementation provides a client-side approach
 * that works with a proxy server.
 */

export interface CalDAVCredentials {
  serverUrl: string;
  username: string;
  password: string; // Or app-specific password
}

export interface CalDAVConfig {
  serverUrl: string;
  username: string;
  useAppSpecificPassword?: boolean;
}

/**
 * Get iCloud CalDAV server URL for a user
 */
export function getICloudCalDAVUrl(username: string): string {
  // Extract domain from email (e.g., user@icloud.com -> user)
  const userPart = username.split('@')[0];
  return `https://caldav.icloud.com/${encodeURIComponent(userPart)}/calendars/`;
}

/**
 * Generate CalDAV authentication header
 */
export function generateCalDAVAuth(username: string, password: string): string {
  const credentials = `${username}:${password}`;
  return `Basic ${btoa(credentials)}`;
}

/**
 * Fetch calendar events from CalDAV server
 * 
 * Note: This requires a backend proxy due to CORS restrictions.
 * For production, implement a backend endpoint that handles CalDAV requests.
 */
export async function fetchCalDAVEvents(
  serverUrl: string,
  username: string,
  password: string,
  startDate?: Date,
  endDate?: Date
): Promise<any[]> {
  // For client-side implementation, we'll use a proxy endpoint
  // In production, you should implement this on your backend
  
  const proxyUrl = import.meta.env.VITE_CALDAV_PROXY_URL || '/api/caldav';
  
  const start = startDate || new Date();
  start.setHours(0, 0, 0, 0);
  
  const end = endDate || new Date();
  end.setHours(23, 59, 59, 999);

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        serverUrl,
        username,
        password,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`CalDAV request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.events || [];
  } catch (error) {
    console.error('CalDAV fetch error:', error);
    throw error;
  }
}

/**
 * Alternative: Direct iCloud Web Calendar access
 * This uses iCloud's web interface (requires authentication)
 */
export async function fetchICloudCalendarDirect(
  username: string,
  password: string,
  date: Date = new Date()
): Promise<any[]> {
  // Note: Direct iCloud access from browser is limited due to:
  // 1. CORS restrictions
  // 2. Two-factor authentication requirements
  // 3. Security policies
  
  // This would require a backend service to handle authentication
  // and calendar data fetching
  
  throw new Error(
    'Direct iCloud access requires backend implementation. ' +
    'Please use CalDAV proxy or implement a backend service.'
  );
}

/**
 * Store CalDAV credentials securely (in memory only, not localStorage for security)
 */
let caldavCredentials: CalDAVCredentials | null = null;

export function setCalDAVCredentials(credentials: CalDAVCredentials): void {
  caldavCredentials = credentials;
}

export function getCalDAVCredentials(): CalDAVCredentials | null {
  return caldavCredentials;
}

export function clearCalDAVCredentials(): void {
  caldavCredentials = null;
}

/**
 * Check if CalDAV is configured
 */
export function isCalDAVConfigured(): boolean {
  return caldavCredentials !== null;
}

/**
 * Instructions for getting iCloud App-Specific Password
 */
export const ICLOUD_SETUP_INSTRUCTIONS = `
To connect to Apple Calendar (iCloud):

1. Enable Two-Factor Authentication on your Apple ID
   - Go to appleid.apple.com
   - Sign in and enable 2FA

2. Generate an App-Specific Password:
   - Go to appleid.apple.com
   - Sign in → Security → App-Specific Passwords
   - Click "Generate Password"
   - Name it (e.g., "SyncUp Calendar")
   - Copy the generated password

3. Use your Apple ID email and the app-specific password to connect

Note: For production use, implement a backend proxy server to handle
CalDAV requests securely, as direct browser access has CORS limitations.
`;
