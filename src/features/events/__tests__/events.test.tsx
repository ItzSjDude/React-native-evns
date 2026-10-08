import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {apiRequest, apiRequestPage} from '../../../core/api/apiClient';
import {getEvent, getEvents} from '../eventsService';
import {formatEventPrice, goingLabel, viewerStatusLabel} from '../eventsPresentation';
import EventsScreen from '../EventsScreen';
import EventDetailSheet from '../EventDetailSheet';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), apiRequestPage: jest.fn()}));
jest.mock('react-native-safe-area-context', () => ({SafeAreaView: ({children}: any) => children}));
jest.mock('../../../components/BottomSheet', () => {
  const {Text} = require('react-native');
  return ({visible, title, children}: any) => visible ? <><Text>{title}</Text>{children}</> : null;
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
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<EventsScreen visible onClose={() => {}} />); });
  await flush();
  expect(texts(r!)).toEqual(expect.arrayContaining(['Rooftop Night', '12 / 100 going']));
  await ReactTestRenderer.act(async () => { r!.root.findByProps({accessibilityLabel: 'Open event Rooftop Night'}).props.onPress(); });
  await flush();
  expect(request).toHaveBeenCalledWith('/events/e1', {auth: 'optional'});
  expect(texts(r!)).toContain('Music and views');
});

test('list shows empty and error states', async () => {
  page.mockResolvedValue({data: [], meta: {limit: 20, offset: 0, hasMore: false}});
  let r: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<EventsScreen visible onClose={() => {}} />); });
  await flush();
  expect(texts(r!)).toContain('No upcoming events');
  page.mockRejectedValue({status: 500, message: 'Boom'});
  await ReactTestRenderer.act(async () => { r!.root.findAll(() => true); r!.update(<EventsScreen visible={false} onClose={() => {}} />); });
  await ReactTestRenderer.act(async () => { r!.update(<EventsScreen visible onClose={() => {}} />); });
  await flush();
  expect(texts(r!)).toContain('Boom');
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
