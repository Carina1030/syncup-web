/**
 * Date utility functions
 */

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD to Date
 */
export function parseDate(dateString: string): Date {
  return new Date(dateString + 'T00:00:00');
}

/**
 * Get all dates in a range
 */
export function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  
  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

/**
 * Format date for display (e.g., "May 20, 2024")
 */
export function formatDateDisplay(dateString: string): string {
  const date = parseDate(dateString);
  const options: Intl.DateTimeFormatOptions = { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  };
  return date.toLocaleDateString('en-US', options);
}

/**
 * Format date for short display (e.g., "May 20")
 */
export function formatDateShort(dateString: string): string {
  const date = parseDate(dateString);
  const options: Intl.DateTimeFormatOptions = { 
    month: 'short', 
    day: 'numeric' 
  };
  return date.toLocaleDateString('en-US', options);
}

/**
 * Get day of week (e.g., "Mon", "Tue")
 */
export function getDayOfWeek(dateString: string): string {
  const date = parseDate(dateString);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getDay()];
}

/**
 * Check if date is today
 */
export function isToday(dateString: string): boolean {
  return formatDate(new Date()) === dateString;
}

/**
 * Check if date is in the past
 */
export function isPast(dateString: string): boolean {
  const today = formatDate(new Date());
  return dateString < today;
}
