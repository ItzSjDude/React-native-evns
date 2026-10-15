import {formatNotificationTime, mapNotification, resolveNotificationTarget, toStringData} from '../notificationTargets';
import type {ApiNotification} from '../types';

const row = (overrides: Partial<ApiNotification> = {}): ApiNotification => ({
  id: 'n1', user_id: 'u1', type: 'POST_LIKED', title: 'Asha liked your post', body: null, data: {postId: 'post-1'},
  read_at: null, created_at: '2026-10-08T10:00:00Z', ...overrides,
});

describe('toStringData', () => {
  test.each([[null], [undefined], ['text'], [42], [true]])('returns {} for non-object input %p', input => {
    expect(toStringData(input)).toEqual({});
  });

  test('keeps strings, JSON-encodes everything else and drops null/undefined', () => {
    expect(toStringData({
      a: 'x', n: 3, neg: -2, flag: false, nothing: null, missing: undefined, list: ['u1', 'u2'], nested: {k: 1},
    })).toEqual({a: 'x', n: '3', neg: '-2', flag: 'false', list: '["u1","u2"]', nested: '{"k":1}'});
  });

  test('FCM string payloads pass through untouched', () => {
    expect(toStringData({postId: 'p1', actorCount: '3', actorIds: '["a","b"]'})).toEqual({postId: 'p1', actorCount: '3', actorIds: '["a","b"]'});
  });
});

describe('resolveNotificationTarget', () => {
  test('POST_COMMENTED opens the post and keeps the commentId so the thread can focus the comment', () => {
    const target = resolveNotificationTarget('POST_COMMENTED', {postId: 'post-1', commentId: 'c-9', actorId: 'u2', actorName: 'Ravi'});
    expect(target).toEqual({
      kind: 'post', id: 'post-1', type: 'POST_COMMENTED',
      data: {postId: 'post-1', commentId: 'c-9', actorId: 'u2', actorName: 'Ravi'},
    });
  });

  test('POST_COMMENTED without a commentId still opens the post (no commentId in data)', () => {
    const target = resolveNotificationTarget('POST_COMMENTED', {postId: 'post-1'});
    expect(target).toMatchObject({kind: 'post', id: 'post-1'});
    expect((target as {data: Record<string, string>}).data.commentId).toBeUndefined();
  });

  test('grouped POST_LIKED (REST JSON with numeric actorCount and array actorIds) targets the post and stringifies the group data', () => {
    const target = resolveNotificationTarget('POST_LIKED', {
      postId: 'post-1', actorId: 'u9', actorName: 'Asha', actorCount: 3, actorIds: ['u9', 'u8', 'u7'],
    });
    expect(target).toMatchObject({kind: 'post', id: 'post-1', type: 'POST_LIKED'});
    expect((target as {data: Record<string, string>}).data).toEqual({
      postId: 'post-1', actorId: 'u9', actorName: 'Asha', actorCount: '3', actorIds: '["u9","u8","u7"]',
    });
  });

  test('grouped POST_LIKED arriving over FCM (all strings) resolves identically to the REST shape', () => {
    const rest = resolveNotificationTarget('POST_LIKED', {postId: 'p', actorCount: 3, actorIds: ['a', 'b']});
    const fcm = resolveNotificationTarget('POST_LIKED', {postId: 'p', actorCount: '3', actorIds: '["a","b"]'});
    expect(fcm).toEqual(rest);
  });

  test('USER_FOLLOWED opens the follower profile via userId', () => {
    expect(resolveNotificationTarget('USER_FOLLOWED', {userId: 'u2', actorId: 'u2'})).toMatchObject({kind: 'user', id: 'u2'});
  });

  test('conversation beats party, post, event, note and user (priority order)', () => {
    const everything = {userId: 'u', noteId: 'n', eventId: 'e', postId: 'p', partyId: 'pa', conversationId: 'c'};
    const order: string[] = [];
    const remaining: Record<string, string> = {...everything};
    while (Object.keys(remaining).length) {
      const target = resolveNotificationTarget('X', remaining) as {kind: string; id: string};
      order.push(target.kind);
      const used = Object.entries(everything).find(([, id]) => id === target.id)![0];
      delete remaining[used];
    }
    expect(order).toEqual(['conversation', 'party', 'post', 'event', 'vibeNote', 'user']);
  });

  test('PARTY_CANCELLED skips the party id and falls through to the next key', () => {
    expect(resolveNotificationTarget('PARTY_CANCELLED', {partyId: 'p1'})).toMatchObject({kind: 'notifications'});
    expect(resolveNotificationTarget('PARTY_CANCELLED', {partyId: 'p1', eventId: 'e1'})).toMatchObject({kind: 'event', id: 'e1'});
  });

  test('the party skip only applies to PARTY_CANCELLED', () => {
    expect(resolveNotificationTarget('PARTY_REMINDER', {partyId: 'p1'})).toMatchObject({kind: 'party', id: 'p1'});
  });

  test.each([
    ['the literal string "null"', {postId: 'null'}],
    ['an empty string', {postId: ''}],
    ['a JSON null', {postId: null}],
    ['an unknown key only', {workspaceId: 'w1', delta: -2}],
    ['no data', undefined],
  ])('%s is not a usable id and falls back to the notifications sheet', (_name, data) => {
    expect(resolveNotificationTarget('POST_LIKED', data).kind).toBe('notifications');
  });

  test('an unusable higher-priority id falls through to a usable lower one', () => {
    expect(resolveNotificationTarget('NEW_MESSAGE', {conversationId: 'null', postId: 'p1'})).toMatchObject({kind: 'post', id: 'p1'});
  });

  test('fallback target keeps the type and the normalised data', () => {
    expect(resolveNotificationTarget('CREDITS_LOW', {delta: -2})).toEqual({kind: 'notifications', type: 'CREDITS_LOW', data: {delta: '-2'}});
  });

  test('uses data.type when no explicit type is given (FCM payloads), preferring the explicit one when both exist', () => {
    expect(resolveNotificationTarget(undefined, {type: 'POST_LIKED', postId: 'p1'})).toMatchObject({kind: 'post', type: 'POST_LIKED'});
    expect(resolveNotificationTarget(undefined, {workspaceId: 'w', type: 'CREDITS_LOW'})).toMatchObject({kind: 'notifications', type: 'CREDITS_LOW'});
    expect(resolveNotificationTarget('POST_COMMENTED', {type: 'POST_LIKED', postId: 'p1'})).toMatchObject({type: 'POST_COMMENTED'});
  });

  test('an id-bearing target with neither type nor data.type gets an empty-string type, not undefined', () => {
    expect(resolveNotificationTarget(undefined, {postId: 'p1'})).toMatchObject({kind: 'post', id: 'p1', type: ''});
  });
});

describe('mapNotification', () => {
  test('maps snake_case columns to the app model and resolves the target from the normalised data', () => {
    const mapped = mapNotification(row({
      type: 'POST_COMMENTED', title: 'Ravi commented', body: 'Nice!', data: {postId: 'post-1', commentId: 'c-1'}, read_at: '2026-10-08T11:00:00Z',
    }));
    expect(mapped).toEqual({
      id: 'n1', type: 'POST_COMMENTED', title: 'Ravi commented', body: 'Nice!', data: {postId: 'post-1', commentId: 'c-1'},
      readAt: '2026-10-08T11:00:00Z', createdAt: '2026-10-08T10:00:00Z',
      target: {kind: 'post', id: 'post-1', type: 'POST_COMMENTED', data: {postId: 'post-1', commentId: 'c-1'}},
    });
  });

  test('tolerates null data, and missing body / read_at', () => {
    const mapped = mapNotification(row({data: null, body: undefined as unknown as null, read_at: undefined as unknown as null}));
    expect(mapped).toMatchObject({data: {}, body: null, readAt: null, target: {kind: 'notifications', type: 'POST_LIKED'}});
  });

  test('a grouped like row exposes actorCount/actorIds as strings alongside a post target', () => {
    const mapped = mapNotification(row({
      title: 'Asha and 2 others liked your post', data: {postId: 'post-1', actorCount: 3, actorIds: ['u9', 'u8', 'u7']},
    }));
    expect(mapped.data.actorCount).toBe('3');
    expect(JSON.parse(mapped.data.actorIds)).toEqual(['u9', 'u8', 'u7']);
    expect(mapped.target).toMatchObject({kind: 'post', id: 'post-1'});
  });
});

describe('formatNotificationTime', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  test.each([
    [0, 'now'], [59, 'now'], [60, '1m'], [89, '1m'], [90, '2m'], [59 * 60, '59m'], [3600, '1h'],
    [23 * 3600, '23h'], [24 * 3600, '1d'], [6 * 86400, '6d'],
  ])('%is ago -> %s', (seconds, expected) => {
    expect(formatNotificationTime(ago(seconds), now)).toBe(expected);
  });

  test('timestamps in the future (clock skew) read as "now"', () => {
    expect(formatNotificationTime(new Date(now + 5 * 60000).toISOString(), now)).toBe('now');
  });

  test('a week or older switches to a calendar date', () => {
    const result = formatNotificationTime(ago(7 * 86400), now);
    expect(result).not.toMatch(/^\d+[mhd]$/);
    expect(result).toMatch(/\d/);
  });

  test.each([[''], ['not-a-date']])('an unparseable timestamp %p yields an empty string', iso => {
    expect(formatNotificationTime(iso, now)).toBe('');
  });
});

describe('organiser sales notifications', () => {
  test.each(['PURCHASE_REQUESTED', 'PAYMENT_MARKED_PAID'] as const)('%s targets the sales thread, not the event', type => {
    const target = resolveNotificationTarget(type, {conversationId: 'conv-1', eventId: 'e1'});
    expect(target).toMatchObject({kind: 'conversation', id: 'conv-1', type});
  });
});
