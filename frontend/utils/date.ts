/**
 * Date formatting utilities with timezone support
 * 
 * Author: Sam Li
 */

import { getConfig } from '@/config';

/**
 * Format a date string or Date object with the configured timezone
 * @param date - Date string or Date object
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string with timezone
 */
export function formatDate(
  date: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }
): string {
  // Handle null or undefined
  if (!date) {
    return 'N/A';
  }
  
  const config = getConfig();
  const timezone = config.timezone || 'UTC';
  
  let dateObj: Date;
  
  if (typeof date === 'string') {
    // SQLite timestamps are in format "YYYY-MM-DD HH:MM:SS" without timezone
    // JavaScript's Date constructor treats these as local time, but SQLite stores them as UTC
    // Convert to ISO format with 'Z' to ensure UTC interpretation
    const sqliteFormat = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    if (sqliteFormat.test(date.trim())) {
      // Replace space with 'T' and append 'Z' for UTC
      dateObj = new Date(date.trim().replace(' ', 'T') + 'Z');
    } else {
      dateObj = new Date(date);
    }
  } else {
    dateObj = date;
  }
  
  // Validate the date
  if (isNaN(dateObj.getTime())) {
    console.warn('Invalid date provided to formatDate');
    return 'Invalid date';
  }
  
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      ...options,
      timeZone: timezone,
      timeZoneName: options.timeZoneName || 'short', // Show timezone abbreviation
    });
    
    return formatter.format(dateObj);
  } catch (error) {
    // Fallback to browser's default if timezone is invalid
    console.warn(`Invalid timezone: ${timezone}, using browser default`, error);
    try {
      return new Intl.DateTimeFormat('en-US', {
        ...options,
        timeZoneName: 'short',
      }).format(dateObj);
    } catch (fallbackError) {
      // Last resort: basic formatting
      return dateObj.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      });
    }
  }
}

/**
 * Format a date with explicit timezone display
 * @param date - Date string or Date object
 * @returns Formatted date string with timezone abbreviation
 */
export function formatDateWithTimezone(date: string | Date | null | undefined): string {
  return formatDate(date, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}

/**
 * Get a list of common timezones
 */
export function getCommonTimezones(): Array<{ value: string; label: string }> {
  return [
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'America/Phoenix', label: 'Arizona Time (MST)' },
    { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
    { value: 'Europe/London', label: 'London (GMT/BST)' },
    { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
    { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
    { value: 'Europe/Rome', label: 'Rome (CET/CEST)' },
    { value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
    { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
    { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
    { value: 'Asia/Dubai', label: 'Dubai (GST)' },
    { value: 'Asia/Kolkata', label: 'Mumbai/New Delhi (IST)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEDT/AEST)' },
    { value: 'Australia/Melbourne', label: 'Melbourne (AEDT/AEST)' },
    { value: 'Pacific/Auckland', label: 'Auckland (NZDT/NZST)' },
  ];
}

/**
 * Get all available timezones (using Intl.supportedValuesOf if available)
 */
export function getAllTimezones(): Array<{ value: string; label: string }> {
  try {
    // Use Intl.supportedValuesOf if available (modern browsers)
    if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
      const timezones = Intl.supportedValuesOf('timeZone');
      return timezones.map(tz => ({
        value: tz,
        label: tz.replace(/_/g, ' '),
      }));
    }
  } catch (error) {
    console.warn('Intl.supportedValuesOf not available, using common timezones');
  }
  
  // Fallback to common timezones
  return getCommonTimezones();
}

