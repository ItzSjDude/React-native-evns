import {mergeRoomMessages} from '../usePartyRoomState';
import type {PartyChatMessage} from '../partyService';
const message = (id: string, time: number): PartyChatMessage => ({id, userId: 'friend', name: 'Friend', body: id, createdAt: new Date(time).toISOString()});
test('deduplicates the same message arriving through realtime, send response and room recovery', () => {
  const first = message('one', 1);
  const second = message('two', 2);
  expect(mergeRoomMessages([second, first], [first, second])).toEqual([first, second]);
});
test('retains the newest 50 messages when reconnecting to a busy room', () => {
  const older = Array.from({length: 30}, (_, i) => message(String(i), i));
  const newer = Array.from({length: 40}, (_, i) => message(String(i + 20), i + 20));
  const merged = mergeRoomMessages(older, newer);
  expect(merged).toHaveLength(50);
  expect(merged[0].id).toBe('10');
  expect(merged[49].id).toBe('59');
});
