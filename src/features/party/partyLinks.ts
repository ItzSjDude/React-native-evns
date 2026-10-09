import {API_BASE_URL} from '../../core/api/apiClient';
import {createPartyShareLink, type PartyRoom} from './partyService';
const tokenPattern = /^[a-f0-9]{32}$/i;
export function parsePartyLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol === 'hiva:' && url.hostname === 'party') {
      const token = url.pathname.slice(1);
      return tokenPattern.test(token) ? token : null;
    }
    if (url.origin !== new URL(API_BASE_URL).origin) return null;
    const match = url.pathname.match(/^\/parties\/share\/([a-f0-9]{32})\/?$/i);
    return match?.[1] || null;
  } catch {return null;}
}
export async function partyShareMessage(room: PartyRoom): Promise<string> {
  const token = room.shareToken || (await createPartyShareLink(room.id)).shareToken;
  return `${room.title || 'Join my audio party'}\nhiva://party/${token}`;
}
