import React from 'react';
import {FlatList} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {apiRequest, apiRequestPage} from '../../../core/api/apiClient';
import {getEvent, getEvents, requestEventTicket, setEventInterest} from '../eventsService';
import {formatEventPrice, goingLabel, viewerStatusLabel} from '../eventsPresentation';
import EventsList from '../EventsList';
import EventDetailSheet from '../EventDetailSheet';
import MyTicketsSheet from '../MyTicketsSheet';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), apiRequestPage: jest.fn()}));
jest.mock('react-native-safe-area-context', () => ({SafeAreaView: ({children}: any) => children}));
jest.mock('../../../components/BottomSheet', () => {
  const {Text, Pressable} = require('react-native');
  const SheetButton = ({label, onPress, disabled}: any) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}><Text>{label}</Text></Pressable>;
  return {__esModule: true, default: ({visible, title, children, footer}: any) => visible ? <><Text>{title}</Text>{children}{footer}</> : null, SheetButton};
});

const page = apiRequestPage as jest.Mock;
const request = apiRequest as jest.Mock;

const event = (over: Record<string, unknown> = {}) => ({
  id: 'e1', title: 'Rooftop Night', description: 'Music and views', cover_url: null, venue: 'Skyline', address: '1 Main St',
  starts_at: '2026-11-01T18:00:00.000Z', ends_at: null, timezone: 'Asia/Kolkata', is_paid: false, price_minor: 0, currency: 'INR',
  capacity: 100, tickets_issued: 12, status: 'PUBLISHED', workspace_name: 'Hiva Co', workspace_logo_url: null, ...over,
});

const texts = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));
const flush = async () => { await ReactTestRenderer.act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

beforeEach(() => jest.clearAllMocks());

test('service uses public paths with optional auth and maps the page', async () => {
  page.mockResolvedValue({data: [event()], meta: {limit: 20, offset: 0, hasMore: true}});
  expect(await getEvents(0, 20, ' jazz ')).toEqual({items: [event()], hasMore: true, offset: 0});
  expect(page).toHaveBeenCalledWith('/events?limit=20&offset=0&search=jazz', {auth: 'optional'});
  request.mockResolvedValue({event: event(), viewer: {}, stats: null});
  await getEvent('e1');
  expect(request).toHaveBeenCalledWith('/events/e1', {auth: 'optional'});
  await setEventInterest('e1', 'INTERESTED');
  expect(request).toHaveBeenLastCalledWith('/events/e1/interest', {auth: 'required', method: 'POST', body: JSON.stringify({status: 'INTERESTED'})});
  await requestEventTicket('e1');
  expect(request).toHaveBeenLastCalledWith('/events/e1/purchase', {auth: 'required', method: 'POST'});
});

test('presentation helpers', () => {
  expect(formatEventPrice({is_paid: false, price_minor: 0, currency: 'INR'})).toBe('Free');
  expect(formatEventPrice({is_paid: true, price_minor: 50000, currency: 'INR'})).toMatch(/500/);
  expect(goingLabel({tickets_issued: 3, capacity: null})).toBe('3 going');
  expect(viewerStatusLabel({interest: null, ticket: {id: 't', code: 'GTHR-1', status: 'ISSUED'}, conversationId: null, isStaff: false})).toMatch(/GTHR-1/);
  expect(viewerStatusLabel(null)).toBeNull();
});

test('list renders events from the API and opens the detail', async () => {
  page.mockResolvedValue({data: [event()], meta: {limit: 20, offset: 0, hasMore: false}});
  request.mockResolvedValue({event: event(), viewer: {interest: null, ticket: null, conversationId: null, isStaff: false}, stats: null});
  let r: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<EventsList />); });
  await flush();
  expect(texts(r!)).toEqual(expect.arrayContaining(['Rooftop Night', '12 / 100 going']));
  await ReactTestRenderer.act(async () => { r!.root.findByProps({accessibilityLabel: 'Open event Rooftop Night'}).props.onPress(); });
  await flush();
  expect(request).toHaveBeenCalledWith('/events/e1', {auth: 'optional'});
  expect(texts(r!)).toContain('Music and views');
  await ReactTestRenderer.act(async () => { r!.unmount(); });
});

test('list shows empty and error states', async () => {
  page.mockResolvedValue({data: [], meta: {limit: 20, offset: 0, hasMore: false}});
  let r: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<EventsList />); });
  await flush();
  expect(texts(r!)).toContain('No upcoming events');
  page.mockRejectedValue({status: 500, message: 'Boom'});
  await ReactTestRenderer.act(async () => { r!.root.findByType(FlatList).props.refreshControl.props.onRefresh(); });
  await flush();
  expect(texts(r!)).toContain('Boom');
  page.mockResolvedValue({data: [event()], meta: {limit: 20, offset: 0, hasMore: false}});
  await ReactTestRenderer.act(async () => { r!.root.findByProps({accessibilityLabel: 'Retry'}).props.onPress(); });
  await flush();
  expect(texts(r!)).toContain('Rooftop Night');
  await ReactTestRenderer.act(async () => { r!.unmount(); });
});

test('detail loads, shows organiser, ticket status', async () => {
  request.mockResolvedValue({event: event(), viewer: {interest: 'TICKETED', ticket: {id: 't', code: 'GTHR-9', status: 'ISSUED'}, conversationId: null, isStaff: false}, stats: null});
  let r: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<EventDetailSheet eventId="e1" visible onClose={() => {}} />); });
  await flush();
  const all = texts(r!);
  expect(all).toEqual(expect.arrayContaining(['Music and views', 'Skyline', 'Free']));
  expect(all.some(t => t.includes('GTHR-9'))).toBe(true);
});

test('free event request issues the ticket, refreshes detail and opens the ticket pass', async () => {
  const detail = {event: event(), viewer: {interest: null, ticket: null, conversationId: null, isStaff: false}, stats: null};
  request.mockImplementation((path: string) => path === '/events/e1'
    ? Promise.resolve(detail)
    : Promise.resolve({mode: 'TICKET_ISSUED', ticket: {id: 't1', code: 'HIVA-42'}}));
  const openTickets = jest.fn();
  let r: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {r = ReactTestRenderer.create(<EventDetailSheet eventId="e1" visible onClose={() => {}} onOpenTickets={openTickets} />);});
  await flush();
  await ReactTestRenderer.act(async () => {r!.root.findByProps({accessibilityLabel: 'Get free ticket'}).props.onPress();});
  await flush();
  expect(request).toHaveBeenCalledWith('/events/e1/purchase', {auth: 'required', method: 'POST'});
  expect(openTickets).toHaveBeenCalledWith('e1', 't1');
  await ReactTestRenderer.act(async () => {r!.unmount();});
});

test('paid event request opens the event inbox at the returned organiser conversation', async () => {
  const detail = {event: event({is_paid: true, price_minor: 14900}), viewer: {interest: null, ticket: null, conversationId: null, isStaff: false}, stats: null};
  request.mockImplementation((path: string) => path === '/events/e1'
    ? Promise.resolve(detail)
    : Promise.resolve({mode: 'CHAT_OPENED', conversationId: 'c1'}));
  const openChat = jest.fn();
  let r: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {r = ReactTestRenderer.create(<EventDetailSheet eventId="e1" visible onClose={() => {}} onOpenEventChat={openChat} />);});
  await flush();
  const requestButton = r!.root.find(node => String(node.props.accessibilityLabel || '').startsWith('Request ticket'));
  await ReactTestRenderer.act(async () => {requestButton.props.onPress();});
  await flush();
  expect(openChat).toHaveBeenCalledWith('c1');
  await ReactTestRenderer.act(async () => {r!.unmount();});
});

test('My tickets loads the signed pass image only after opening a ticket', async () => {
  const ticket = {id: 't1', code: 'HIVA-42', status: 'ISSUED', issued_at: '2026-10-12T00:00:00.000Z', event_id: 'e1', event_title: 'Rooftop Night', event_starts_at: '2026-11-01T18:00:00.000Z', event_ends_at: null, event_venue: 'Skyline', event_address: null, event_cover_url: null, event_timezone: 'Asia/Kolkata', workspace_name: 'Hiva Co'};
  page.mockResolvedValue({data: [ticket], meta: {limit: 50, offset: 0, hasMore: false}});
  request.mockResolvedValue({...ticket, qrImageDataUrl: 'data:image/png;base64,abc'});
  let r: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {r = ReactTestRenderer.create(<MyTicketsSheet visible onClose={() => {}} />);});
  await flush();
  expect(texts(r!)).toContain('Rooftop Night');
  await ReactTestRenderer.act(async () => {r!.root.findByProps({accessibilityLabel: 'Open ticket for Rooftop Night'}).props.onPress();});
  await flush();
  expect(request).toHaveBeenCalledWith('/tickets/t1?includeImage=true', {auth: 'required'});
  expect(r!.root.findByProps({accessibilityLabel: 'Ticket QR code'})).toBeTruthy();
  await ReactTestRenderer.act(async () => {r!.unmount();});
});

test('opens a newly issued ticket directly, then returns to the ticket list', async () => {
  const ticket = {id: 't1', code: 'HIVA-42', status: 'ISSUED', issued_at: '2026-10-12T00:00:00.000Z', event_id: 'e1', event_title: 'Rooftop Night', event_starts_at: '2026-11-01T18:00:00.000Z', event_ends_at: null, event_venue: 'Skyline', event_address: null, event_cover_url: null, event_timezone: 'Asia/Kolkata', workspace_name: 'Hiva Co', qrImageDataUrl: 'data:image/png;base64,abc'};
  request.mockResolvedValue(ticket);
  page.mockResolvedValue({data: [], meta: {limit: 50, offset: 0, hasMore: false}});
  const Harness = () => {
    const [focusedTicket, setFocusedTicket] = React.useState<string | null>('t1');
    return <MyTicketsSheet visible eventId="e1" ticketId={focusedTicket} onExitTicket={() => setFocusedTicket(null)} onClose={() => {}} />;
  };
  let r: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {r = ReactTestRenderer.create(<Harness />);});
  await flush();
  expect(request).toHaveBeenCalledWith('/tickets/t1?includeImage=true', {auth: 'required'});
  await ReactTestRenderer.act(async () => {r!.root.findByProps({accessibilityLabel: 'Back to my tickets'}).props.onPress();});
  await flush();
  expect(page).toHaveBeenCalledWith('/tickets?upcoming=true&limit=50&offset=0', {auth: 'required'});
  await ReactTestRenderer.act(async () => {r!.unmount();});
});

test('sold-out published event offers a backend-backed waitlist join and leave action', async () => {
  const soldOut = event({capacity: 12, tickets_issued: 12});
  request.mockImplementation((path: string) => {
    if (path === '/events/e1') return Promise.resolve({event: soldOut, viewer: {interest: null, ticket: null, conversationId: null, isStaff: false}, stats: null});
    if (path === '/waitlist/events/e1/join') return Promise.resolve({id: 'q1', event_id: 'e1', status: 'WAITING', offer_expires_at: null});
    return Promise.resolve({id: 'q1', event_id: 'e1', status: 'LEFT'});
  });
  page.mockResolvedValue({data: [], meta: {limit: 100, offset: 0, hasMore: false}});
  let r: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {r = ReactTestRenderer.create(<EventDetailSheet eventId="e1" visible onClose={() => {}} />);});
  await flush();
  await ReactTestRenderer.act(async () => {r!.root.findByProps({accessibilityLabel: 'Join waitlist'}).props.onPress();});
  expect(request).toHaveBeenCalledWith('/waitlist/events/e1/join', {auth: 'required', method: 'POST'});
  expect(texts(r!)).toContain('Leave waitlist');
  await ReactTestRenderer.act(async () => {r!.unmount();});
});
