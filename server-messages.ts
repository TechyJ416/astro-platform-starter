// src/lib/server-messages.ts
// Client-side helper for server messages

/**
 * Generate SHA-256 hash for privacy-safe identifier
 */
export async function hashIdentifier(identifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(identifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create browser identifier (stored in localStorage)
 */
export function getBrowserId(): string {
  const STORAGE_KEY = 'banity_browser_id';
  
  if (typeof localStorage === 'undefined') {
    return crypto.randomUUID();
  }
  
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

/**
 * Fetch active server messages
 */
export async function getMessages(hashedId?: string): Promise<any[]> {
  const url = hashedId 
    ? `/api/messages?hid=${encodeURIComponent(hashedId)}`
    : '/api/messages';
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch messages');
  }
  
  return data.messages || [];
}

/**
 * Dismiss a message
 */
export async function dismissMessage(messageId: number, hashedId: string): Promise<boolean> {
  const response = await fetch('/api/messages/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, hashedIdentifier: hashedId }),
  });
  
  const data = await response.json();
  return data.success;
}

/**
 * Load messages for current browser (convenience function)
 */
export async function loadMessagesForBrowser(): Promise<any[]> {
  try {
    const browserId = getBrowserId();
    const hashedId = await hashIdentifier(browserId);
    return await getMessages(hashedId);
  } catch (error) {
    console.error('Error loading messages:', error);
    return [];
  }
}

/**
 * Dismiss message for current browser (convenience function)
 */
export async function dismissForBrowser(messageId: number): Promise<boolean> {
  try {
    const browserId = getBrowserId();
    const hashedId = await hashIdentifier(browserId);
    return await dismissMessage(messageId, hashedId);
  } catch (error) {
    console.error('Error dismissing message:', error);
    return false;
  }
}
