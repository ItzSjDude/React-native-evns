import {API_BASE_URL} from '../../core/api/apiClient';
import {LINK_ORIGIN} from '../../core/config/env';
import {createPartyShareLink, type PartyRoom} from './partyService';
const tokenPattern = /^(?:[A-Za-z0-9_-]{12}|[a-fA-F0-9]{32})$/;

export const isPartyShareToken = (value: string): boolean => tokenPattern.test(value);

export function parsePartyLink(raw: string, linkOrigin = LINK_ORIGIN): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol === 'hiva:' && url.hostname === 'party') {
      const token = url.pathname.slice(1);
      return isPartyShareToken(token) ? token : null;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    const token = url.pathname.match(/^\/r\/([^/]+)\/?$/)?.[1];
    if (linkOrigin && url.origin === linkOrigin && token && isPartyShareToken(token)) return token;

    // Keep links created by the pre-Universal-Link API working during rollout.
    if (url.origin !== new URL(API_BASE_URL).origin) return null;
    const legacy = url.pathname.match(/^\/parties\/share\/([^/]+)\/?$/)?.[1];
    return legacy && isPartyShareToken(legacy) ? legacy : null;
  } catch {return null;}
}
export async function partyShareMessage(room: PartyRoom): Promise<string> {
  const {link} = await createPartyShareLink(room.id);
  const shareUrl = typeof link === 'string' ? link.trim() : '';
  try {
    const parsed = new URL(shareUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error();
  } catch {
    throw new Error('The server returned an invalid party link.');
  }
  return `${room.title || 'Join my audio party'}\n${shareUrl}`;
}
