/**
 * Shared utilities used across all sub-agents.
 * Provides API request wrapper, identifier format detection, and ESM loader.
 */

import { AGENT_CONFIG } from '../config';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

export async function apiRequest<T = any>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ success: boolean; data?: T; error?: { code: string; message: string; details?: any } }> {
  try {
    const url = `${AGENT_CONFIG.apiBaseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    return await response.json() as { success: boolean; data?: T; error?: { code: string; message: string; details?: any } };
  } catch (error: any) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: `Failed to reach the backend API: ${error.message}`,
      },
    };
  }
}

export const importModule = new Function(
  'modulePath',
  'return import(modulePath)'
) as (path: string) => Promise<any>;
