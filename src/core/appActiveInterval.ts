import {AppState} from 'react-native';

/** setInterval that skips ticks while the app is backgrounded. Returns the cleanup function. */
export function setActiveInterval(callback: () => void, ms: number) {
  const timer = setInterval(() => { if (AppState.currentState !== 'background') callback(); }, ms);
  return () => clearInterval(timer);
}
