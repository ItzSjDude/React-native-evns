import type {DiscoveryFilters, DiscoveryLanguage} from './types';

export const LANGUAGES: {value: DiscoveryLanguage; label: string}[] = [{value: 'en', label: 'English'}, {value: 'hi', label: 'Hindi'}, {value: 'hinglish', label: 'Hinglish'}];

/** Server caps: `city` 1-80, `interest` 1-50 characters. */
export const CITY_MAX_LENGTH = 80;
export const INTEREST_MAX_LENGTH = 50;

export const countFilters = (filters?: DiscoveryFilters) =>
  [filters?.city?.trim(), filters?.interest?.trim(), filters?.language, filters?.activeNow].filter(Boolean).length;

/**
 * `&city=..&interest=..&language=..&activeNow=true` for the filters that are set ('' when none), to append to
 * a `/nearby` or `/users/search` path. Only defined filters are sent; `activeNow=false` is the server default.
 */
export function discoveryQuery(filters?: DiscoveryFilters): string {
  if (!filters) return '';
  const params: [string, string | undefined][] = [
    ['city', filters.city?.trim().slice(0, CITY_MAX_LENGTH)],
    ['interest', filters.interest?.trim().slice(0, INTEREST_MAX_LENGTH)],
    ['language', filters.language],
    ['activeNow', filters.activeNow ? 'true' : undefined],
  ];
  return params.filter(([, value]) => !!value).map(([key, value]) => `&${key}=${encodeURIComponent(value!)}`).join('');
}
