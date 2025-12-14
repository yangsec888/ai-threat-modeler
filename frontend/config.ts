/**
 * Frontend Configuration for AI Threat Modeler Dashboard
 * 
 * This file exports configuration values from environment variables and local storage.
 * For Next.js, environment variables prefixed with NEXT_PUBLIC_ are exposed to the browser.
 * 
 * Note: API keys should generally be kept on the backend. If you need to use these
 * in the frontend, prefix them with NEXT_PUBLIC_ in your .env.local file.
 * 
 * Configuration can be modified through the Settings page and is stored in localStorage.
 * 
 * Author: Sam Li
 */

export interface Config {
  anthropic: {
    apiKey: string;
    baseUrl: string;
  };
  timezone: string;
}

const CONFIG_STORAGE_KEY = 'appsec_agent_config';

// Get default config from environment variables
const getDefaultConfig = (): Config => {
  // Get browser's timezone as default, or UTC if not available
  const defaultTimezone = typeof Intl !== 'undefined' && Intl.DateTimeFormat 
    ? Intl.DateTimeFormat().resolvedOptions().timeZone 
    : 'UTC';
  
  return {
  anthropic: {
    apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    baseUrl: process.env.NEXT_PUBLIC_ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  },
    timezone: process.env.NEXT_PUBLIC_TIMEZONE || defaultTimezone,
  };
};

// Get config from localStorage or return defaults
export const getConfig = (): Config => {
  if (typeof window === 'undefined') {
    return getDefaultConfig();
  }

  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Config;
      // Merge with defaults to ensure all fields exist
      const defaults = getDefaultConfig();
      return {
        anthropic: {
          apiKey: parsed.anthropic?.apiKey || defaults.anthropic.apiKey,
          baseUrl: parsed.anthropic?.baseUrl || defaults.anthropic.baseUrl,
        },
        timezone: parsed.timezone || defaults.timezone,
      };
    }
  } catch (error) {
    console.warn('Failed to load config from localStorage:', error);
  }

  return getDefaultConfig();
};

// Update config in localStorage
export const updateConfig = (newConfig: Partial<Config>): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const current = getConfig();
    const updated: Config = {
      anthropic: {
        ...current.anthropic,
        ...newConfig.anthropic,
      },
      timezone: newConfig.timezone !== undefined ? newConfig.timezone : current.timezone,
    };
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save config to localStorage:', error);
    throw new Error('Failed to save configuration');
  }
};

// Export current config (for backward compatibility)
export const config = getConfig();

