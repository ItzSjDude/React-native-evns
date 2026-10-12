import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {apiRequest} from '../../../core/api/apiClient';
import {
  connectWithAttendee, disconnectFromAttendee, getMyNetworkingProfile, getNetworkingAttendees, getNetworkingConnections,
  optOutOfNetworking, saveMyNetworkingProfile,
} from '../eventNetworkingService';
import {connectionStateOf, networkingEntryState, networkingMessage, parseInterests} from '../networkingPresentation';
import EventNetworkingEntry from '../EventNetworkingEntry';
import EventNetworkingSheet from '../EventNetworkingSheet';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));
// css-interop's third-party wrapper crashes on RN's Switch under jest; a plain host stand-in is enough here.
jest.mock('react-native/Libraries/Components/Switch/Switch', () => {
  const {View} = require('react-native');
  return {__esModule: true, default: (props: any) => <View {...props} />};
});
jest.mock('../../../components/BottomSheet', () => {
  const {Pressable, Text: T, View} = require('react-native');
  return {
    __esModule: true,
    default: ({visible, title, children}: any) => visible ? <View><T>{title}</T>{children}</View> : null,
    SheetButton: ({label, onPress, disabled, busy}: any) =>
      <Pressable accessibilityLabel={label} accessibilityState={{disabled: !!(disabled || busy)}} onPress={disabled || busy ? undefined : onPress}><T>{label}</T></Pressable>,
  };
});
jest.mock('../../users', () => {
  const {Text: T} = require('react-native');
  return {
    Avatar: () => null,
    useViewerId: () => 'me',
    UserProfileModal: ({userId, onBlocked}: any) => <T accessibilityLabel={`profile-modal-${userId}`} onPress={() => onBlocked(userId)}>profile</T>,
  };
});

const request = apiRequest as jest.Mock;
type Renderer = ReactTestRenderer.ReactTestRenderer;

const row = (over: Record<string, unknown> = {}) => ({
  event_id: 'e1', user_id: 'me', opted_in: true, goals: ['FRIENDS'], interests: ['music'], intro: 'Hi',
  discoverable_before: true, discoverable_during: true, discoverable_after: false, ...over,
});
const person = (id: string, over: Record<string, unknown> = {}) =>
  ({id, name: `Person ${id}`, avatarUrl: null, goals: ['NETWORKING'], interests: ['startups'], intro: `About ${id}`, ...over});
const apiError = (status: number, message: string) => ({status, message});

const texts = (r: Renderer) => r.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const nodes = (r: Renderer, label: string) => r.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const press = (r: Renderer, label: string) => ReactTestRenderer.act(async () => {
  const [node] = nodes(r, label);
  if (!node) throw new Error(`No pressable labelled "${label}"`);
  node.props.onPress();
});
const type = (r: Renderer, label: string, value: string) => ReactTestRenderer.act(async () => {
  r.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function')[0].props.onChangeText(value);
});
const flush = () => ReactTestRenderer.act(async () => { await Promise.resolve(); await Promise.resolve(); });

/** Routes each endpoint to a canned reply so a flow can be driven without ordering mocks. */
const routes = (table: Record<string, (init: any) => unknown>) => request.mockImplementation(async (path: string, init: any = {}) => {
  const key = `${init.method ?? 'GET'} ${path.split('?')[0]}`;
  const handler = table[key];
  if (!handler) throw new Error(`Unexpected request ${key}`);
  const out = handler({path, init});
  if (out instanceof Error || (out && (out as any).__throw)) throw (out as any).__throw ?? out;
  return out;
});
const fail = (status: number, message: string) => ({__throw: apiError(status, message)});

const render = async (props: Partial<React.ComponentProps<typeof EventNetworkingSheet>> = {}) => {
  let r: Renderer;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<EventNetworkingSheet eventId="e1" eventTitle="Rooftop" visible onClose={jest.fn()} {...props} />); });
  await flush();
  return r!;
};

let tree: Renderer | undefined;
afterEach(async () => { await ReactTestRenderer.act(async () => tree?.unmount()); tree = undefined; });
beforeEach(() => jest.resetAllMocks());

describe('service', () => {
  test('profile read maps the DB row; null and opted-out rows mean not joined', async () => {
    request.mockResolvedValueOnce(row());
    expect(await getMyNetworkingProfile('e1')).toEqual({
      eventId: 'e1', optedIn: true, goals: ['FRIENDS'], interests: ['music'], intro: 'Hi',
      discoverableBeforeEvent: true, discoverableDuringEvent: true, discoverableAfterEvent: false,
    });
    expect(request).toHaveBeenCalledWith('/events/e1/networking/me', {auth: 'required'});
    request.mockResolvedValueOnce(null);
    expect(await getMyNetworkingProfile('e1')).toBeNull();
  });

  test('opt-in PUTs the strict body; opt-out DELETEs', async () => {
    request.mockResolvedValueOnce(row());
    const input = {goals: ['FRIENDS' as const], interests: ['music'], discoverableBefore: true, discoverableDuring: true, discoverableAfter: false};
    await saveMyNetworkingProfile('e1', input);
    expect(request).toHaveBeenCalledWith('/events/e1/networking/me', {auth: 'required', method: 'PUT', body: JSON.stringify(input)});
    request.mockResolvedValueOnce({optedIn: false});
    await optOutOfNetworking('e1');
    expect(request).toHaveBeenLastCalledWith('/events/e1/networking/me', {auth: 'required', method: 'DELETE'});
  });

  test('attendees and connections use offset paging and filters; a short page ends the list', async () => {
    request.mockResolvedValueOnce([person('a'), person('b')]);
    expect(await getNetworkingAttendees('e1', {goal: 'FRIENDS', interest: ' live music '}, 20, 2)).toEqual({items: [person('a'), person('b')], hasMore: true, offset: 20});
    expect(request).toHaveBeenCalledWith('/events/e1/networking/attendees?limit=2&offset=20&goal=FRIENDS&interest=live%20music', {auth: 'required'});
    request.mockResolvedValueOnce([person('a')]);
    expect((await getNetworkingAttendees('e1')).hasMore).toBe(false);
    request.mockResolvedValueOnce([]);
    await getNetworkingConnections('e1');
    expect(request).toHaveBeenLastCalledWith('/events/e1/networking/connections?limit=50&offset=0', {auth: 'required'});
  });

  test('connect and disconnect hit the per-user connection path', async () => {
    request.mockResolvedValue({connected: false, pending: true});
    await connectWithAttendee('e1', 'u2');
    expect(request).toHaveBeenLastCalledWith('/events/e1/networking/connections/u2', {auth: 'required', method: 'POST'});
    await disconnectFromAttendee('e1', 'u2');
    expect(request).toHaveBeenLastCalledWith('/events/e1/networking/connections/u2', {auth: 'required', method: 'DELETE'});
  });
});

describe('presentation', () => {
  test('error copy: 429, ticket, unavailable and unknown errors', () => {
    expect(networkingMessage(apiError(429, 'Networking requests are rate limited'))).toMatch(/wait a minute/i);
    expect(networkingMessage(apiError(403, 'A valid event ticket is required'))).toMatch(/valid ticket/i);
    expect(networkingMessage(apiError(404, 'Event networking not found'))).toMatch(/cancelled/i);
    expect(networkingMessage(apiError(404, 'Attendee not found'), 'person')).toMatch(/no longer available/i);
    expect(networkingMessage(apiError(500, 'Boom'))).toBe('Boom');
  });

  test('entry state: hidden without ticket/flag, closed when cancelled, completed or past the window', () => {
    const base = {status: 'PUBLISHED', networking_enabled: true, networking_ends_at: null};
    expect(networkingEntryState(base, true)).toBe('open');
    expect(networkingEntryState(base, false)).toBeNull();
    expect(networkingEntryState({...base, networking_enabled: false}, true)).toBeNull();
    expect(networkingEntryState({...base, status: 'CANCELLED'}, true)).toBe('closed');
    expect(networkingEntryState({...base, status: 'COMPLETED'}, true)).toBe('closed');
    expect(networkingEntryState({...base, networking_ends_at: '2020-01-01T00:00:00Z'}, true)).toBe('closed');
  });

  test('interests are trimmed, unique and limited; connection state is relative to the viewer', () => {
    expect(parseInterests(' Music, travel ,music,, ')).toEqual(['Music', 'travel']);
    const connections = [
      {userId: 'a', acceptedAt: '2026-01-01', requestedBy: 'a'}, {userId: 'b', acceptedAt: null, requestedBy: 'me'}, {userId: 'c', acceptedAt: null, requestedBy: 'c'},
    ] as any;
    expect(['a', 'b', 'c', 'd'].map(id => connectionStateOf(id, 'me', connections))).toEqual(['connected', 'requested', 'incoming', 'none']);
  });
});

describe('entry card', () => {
  const event = {id: 'e1', title: 'Rooftop', status: 'PUBLISHED', networking_enabled: true, networking_ends_at: null};
  const mount = async (props: React.ComponentProps<typeof EventNetworkingEntry>) => {
    await ReactTestRenderer.act(async () => { tree = ReactTestRenderer.create(<EventNetworkingEntry {...props} />); });
    return tree!;
  };

  test('shows for ticket holders when networking is on; hidden otherwise; closed copy when cancelled', async () => {
    expect(nodes(await mount({event, hasTicket: true}), 'Meet people at this event')).toHaveLength(1);
    await ReactTestRenderer.act(async () => tree?.unmount());
    expect((await mount({event, hasTicket: false})).toJSON()).toBeNull();
    await ReactTestRenderer.act(async () => tree?.unmount());
    expect((await mount({event: {...event, networking_enabled: false}, hasTicket: true})).toJSON()).toBeNull();
    await ReactTestRenderer.act(async () => tree?.unmount());
    const closed = await mount({event: {...event, status: 'CANCELLED'}, hasTicket: true});
    expect(texts(closed)).toContain('This event was cancelled, so networking is closed.');
    expect(nodes(closed, 'Meet people at this event')).toHaveLength(0);
  });
});

describe('sheet', () => {
  test('not a ticket holder: explains and offers no opt-in', async () => {
    routes({'GET /events/e1/networking/me': () => fail(403, 'A valid event ticket is required')});
    tree = await render();
    expect(texts(tree)).toContain('You need a valid ticket for this event to meet other attendees.');
    expect(nodes(tree, 'Join networking')).toHaveLength(0);
  });

  test('networking off / event cancelled: unavailable copy', async () => {
    routes({'GET /events/e1/networking/me': () => fail(404, 'Event networking not found')});
    tree = await render();
    expect(texts(tree).join(' ')).toMatch(/not available for this event/i);
  });

  test('explicit opt-in: needs the 18+ confirmation, then PUTs and shows attendees', async () => {
    let saved: any = null;
    routes({
      'GET /events/e1/networking/me': () => null,
      'PUT /events/e1/networking/me': ({init}) => { saved = JSON.parse(init.body); return row({goals: saved.goals, interests: saved.interests, intro: saved.intro}); },
      'GET /events/e1/networking/attendees': () => [person('u2')],
      'GET /events/e1/networking/connections': () => [],
    });
    tree = await render();
    // nothing is requested about other people until the user opts in
    expect(request.mock.calls.map(c => c[0])).toEqual(['/events/e1/networking/me']);
    expect(texts(tree).join(' ')).toMatch(/You choose who sees you/);

    const join = () => tree!.root.findAll(n => n.props.accessibilityLabel === 'Join networking' && n.props.accessibilityState)[0];
    expect(join().props.accessibilityState.disabled).toBe(true);
    await press(tree, 'Friends');
    await type(tree, 'Interests', 'Music, startups, music');
    await type(tree, 'Intro', ' Hello ');
    await press(tree, 'I am 18 or older');
    expect(join().props.accessibilityState.disabled).toBe(false);
    await press(tree, 'Join networking');
    await flush();

    expect(saved).toEqual({goals: ['FRIENDS'], interests: ['Music', 'startups'], intro: 'Hello', discoverableBefore: true, discoverableDuring: true, discoverableAfter: false});
    expect(texts(tree)).toContain('Person u2');
  });

  test('opt-out: confirms, DELETEs, returns to the opt-in form and keeps ticket/chat copy', async () => {
    let optedIn = true;
    routes({
      'GET /events/e1/networking/me': () => optedIn ? row() : null,
      'DELETE /events/e1/networking/me': () => { optedIn = false; return {optedIn: false}; },
      'GET /events/e1/networking/attendees': () => [],
      'GET /events/e1/networking/connections': () => [],
    });
    tree = await render();
    await press(tree, 'Leave networking');
    expect(texts(tree).join(' ')).toMatch(/ticket and the event chat are not affected/);
    expect(request.mock.calls.some(c => c[1]?.method === 'DELETE')).toBe(false);
    await press(tree, 'Leave networking');
    await flush();
    expect(request).toHaveBeenCalledWith('/events/e1/networking/me', {auth: 'required', method: 'DELETE'});
    expect(texts(tree).join(' ')).toMatch(/You left networking/);
    // back at the explicit opt-in form (button disabled until 18+ is confirmed again)
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Join networking').length).toBeGreaterThan(0);
  });

  test('attendee list: filters reset the page, Load more appends without duplicates', async () => {
    const full = Array.from({length: 20}, (_, i) => person(`p${i}`));
    routes({
      'GET /events/e1/networking/me': () => row(),
      'GET /events/e1/networking/connections': () => [],
      'GET /events/e1/networking/attendees': ({path}) => {
        if (path.includes('goal=COLLABORATORS')) return [person('c1')];
        return path.includes('offset=20') ? [person('p19'), person('p20')] : full;
      },
    });
    tree = await render();
    expect(texts(tree).filter(t => /^Person /.test(t))).toHaveLength(20);
    await press(tree, 'Load more people');
    await flush();
    expect(request.mock.calls.map(c => c[0])).toContain('/events/e1/networking/attendees?limit=20&offset=20');
    expect(texts(tree).filter(t => /^Person /.test(t))).toHaveLength(21);
    expect(nodes(tree, 'Load more people')).toHaveLength(0);

    await press(tree, 'Filter: Collaborators');
    await flush();
    expect(request.mock.calls.map(c => c[0])).toContain('/events/e1/networking/attendees?limit=20&offset=0&goal=COLLABORATORS');
    expect(texts(tree).filter(t => /^Person /.test(t))).toEqual(['Person c1']);

    await type(tree, 'Filter by interest', 'Music');
    await ReactTestRenderer.act(async () => { tree!.root.findAll(n => n.props.accessibilityLabel === 'Filter by interest')[0].props.onSubmitEditing(); });
    await flush();
    expect(request.mock.calls.map(c => c[0])).toContain('/events/e1/networking/attendees?limit=20&offset=0&goal=COLLABORATORS&interest=Music');
  });

  test('connect sends an explicit request, then shows Request sent; cancelling removes it', async () => {
    let pending = false;
    routes({
      'GET /events/e1/networking/me': () => row(),
      'GET /events/e1/networking/attendees': () => [person('u2')],
      'GET /events/e1/networking/connections': () => pending ? [{userId: 'u2', requestedBy: 'me', acceptedAt: null, name: 'Person u2', avatarUrl: null, intro: null, goals: [], interests: [], createdAt: 'x'}] : [],
      'POST /events/e1/networking/connections/u2': () => { pending = true; return {connected: false, pending: true}; },
      'DELETE /events/e1/networking/connections/u2': () => { pending = false; return {disconnected: true}; },
    });
    tree = await render();
    expect(nodes(tree, 'Request sent to Person u2')).toHaveLength(0);
    await press(tree, 'Connect with Person u2');
    await flush();
    expect(texts(tree)).toContain('Request sent');
    await press(tree, 'Cancel request to Person u2');
    await flush();
    expect(request).toHaveBeenCalledWith('/events/e1/networking/connections/u2', {auth: 'required', method: 'DELETE'});
    expect(nodes(tree, 'Connect with Person u2')).toHaveLength(1);
  });

  test('429 on connect shows friendly rate-limit copy', async () => {
    routes({
      'GET /events/e1/networking/me': () => row(),
      'GET /events/e1/networking/attendees': () => [person('u2')],
      'GET /events/e1/networking/connections': () => [],
      'POST /events/e1/networking/connections/u2': () => fail(429, 'Networking requests are rate limited'),
    });
    tree = await render();
    await press(tree, 'Connect with Person u2');
    await flush();
    expect(texts(tree).join(' ')).toMatch(/going a little fast/i);
  });

  test('every attendee card exposes report/block through the safe profile, and blocking refreshes the list', async () => {
    let calls = 0;
    routes({
      'GET /events/e1/networking/me': () => row(),
      'GET /events/e1/networking/attendees': () => { calls++; return [person('u2'), person('u3')]; },
      'GET /events/e1/networking/connections': () => [],
    });
    tree = await render();
    expect(nodes(tree, 'Report or block Person u2')).toHaveLength(1);
    expect(nodes(tree, 'Report or block Person u3')).toHaveLength(1);
    await press(tree, 'Report or block Person u2');
    expect(nodes(tree, 'profile-modal-u2').length).toBeGreaterThan(0);
    const before = calls;
    await press(tree, 'profile-modal-u2'); // mock modal calls onBlocked
    await flush();
    expect(calls).toBe(before + 1);
  });
});
