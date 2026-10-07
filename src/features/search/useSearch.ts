import {useCallback, useEffect, useState} from 'react';
import {isSearchUnavailable, searchErrorMessage, searchPeople, searchRooms, SEARCH_MAX_LENGTH} from './searchService';
import type {SearchResults, SearchSection} from './types';

export const SEARCH_DEBOUNCE_MS = 300;
const RESULT_LIMIT = 20;

const idleSection: SearchSection<never> = {status: 'idle', items: [], error: null};
const IDLE: SearchResults = {query: '', people: idleSection, rooms: idleSection};
const loading = <T,>(previous: SearchSection<T>): SearchSection<T> => ({status: 'loading', items: previous.items, error: null});
const failed = <T,>(error: unknown, canBeMissing: boolean): SearchSection<T> => canBeMissing && isSearchUnavailable(error)
  ? {status: 'unavailable', items: [], error: null}
  : {status: 'error', items: [], error: searchErrorMessage(error)};

export const normalizeQuery = (input: string) => input.trim().slice(0, SEARCH_MAX_LENGTH);

/**
 * Debounced people + rooms search for `input`. Each new query (or unmount) aborts the previous
 * requests through apiRequest's `signal`, and late responses for an old query are dropped.
 */
export function useSearch(input: string, {enabled = true, debounceMs = SEARCH_DEBOUNCE_MS} = {}) {
  const [results, setResults] = useState<SearchResults>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const query = enabled ? normalizeQuery(input) : '';

  useEffect(() => {
    if (!query) {
      setResults(IDLE);
      return;
    }
    const controller = new AbortController();
    const {signal} = controller;
    const timer = setTimeout(() => {
      // Keep the previous rows visible (dimmed by the UI) only when refining the same query.
      setResults(previous => previous.query === query
        ? {query, people: loading(previous.people), rooms: loading(previous.rooms)}
        : {query, people: loading(idleSection), rooms: loading(idleSection)});
      const apply = (patch: Partial<Pick<SearchResults, 'people' | 'rooms'>>) => {
        if (!signal.aborted) setResults(previous => previous.query === query ? {...previous, ...patch} : previous);
      };
      searchPeople(query, {limit: RESULT_LIMIT, signal}).then(
        items => apply({people: {status: 'success', items, error: null}}),
        error => apply({people: failed(error, true)}));
      searchRooms(query, {limit: RESULT_LIMIT, signal}).then(
        items => apply({rooms: {status: 'success', items, error: null}}),
        error => apply({rooms: failed(error, false)}));
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, debounceMs, attempt]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  /** Drop a person locally, e.g. after the viewer blocks them from their profile. */
  const removePerson = useCallback((userId: string) => setResults(previous => ({
    ...previous, people: {...previous.people, items: previous.people.items.filter(person => person.id !== userId)},
  })), []);

  /** True while the user is still typing (debounce pending) or the latest query is loading. */
  const pending = !!query && (results.query !== query || results.people.status === 'loading' || results.rooms.status === 'loading');
  return {...results, typedQuery: query, pending, retry, removePerson};
}
