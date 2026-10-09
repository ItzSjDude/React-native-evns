import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {Provider} from 'react-redux';
import {configureStore} from '@reduxjs/toolkit';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {
  deleteToken, getInitialNotification, getToken, onMessage, onNotificationOpenedApp, onTokenRefresh,
} from '@react-native-firebase/messaging';
import {apiRequest, apiRequestPage} from '../../../core/api/apiClient';
import {authReducer, clearSession, setSession} from '../../auth';
import {NotificationsProvider} from '../NotificationsProvider';
import NotificationsBell from '../NotificationsBell';
import {useNotificationNavigator} from '../notificationsContext';
import type {NotificationTarget} from '../types';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), apiRequestPage: jest.fn()}));
const request = apiRequest as jest.Mock;
const requestPage = apiRequestPage as jest.Mock;

const metrics = {frame: {x: 0, y: 0, width: 390, height: 844}, insets: {top: 0, left: 0, right: 0, bottom: 0}};
const session = {accessToken: 'a', refreshToken: 'r', user: {id: 'u1'}} as never;

let unreadCount = 0;
const routeApi = () => {
  request.mockImplementation(async (path: string) => {
    if (path === '/notifications/unread-count') return {count: unreadCount};
    if (path === '/notifications/read') { unreadCount = 0; return {marked: true}; }
    return {};
  });
  requestPage.mockResolvedValue({
    data: [
      {id: 'n1', user_id: 'u1', type: 'NEW_MESSAGE', title: 'New message', body: 'Hey', data: {conversationId: 'c1'}, read_at: null, created_at: new Date().toISOString()},
      {id: 'n2', user_id: 'u1', type: 'PARTY_INVITE', title: 'Asha started a party', body: null, data: {partyId: 'p1'}, read_at: null, created_at: new Date().toISOString()},
    ],
    meta: {limit: 20, offset: 0, hasMore: false},
  });
};

const makeStore = (signedIn: boolean) => {
  const store = configureStore({reducer: {auth: authReducer}});
  store.dispatch(signedIn ? setSession(session) : clearSession());
  return store;
};

const flush = () => ReactTestRenderer.act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); });

const Navigator = ({onNavigate}: {onNavigate: (target: NotificationTarget) => boolean}) => {
  useNotificationNavigator(onNavigate);
  return null;
};

const render = async (store: ReturnType<typeof makeStore>, onNavigate?: (target: NotificationTarget) => boolean) => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <Provider store={store}>
          <NotificationsProvider>
            <NotificationsBell />
            {onNavigate && <Navigator onNavigate={onNavigate} />}
          </NotificationsProvider>
        </Provider>
      </SafeAreaProvider>,
    );
  });
  await flush();
  return renderer!;
};

const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const press = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  ReactTestRenderer.act(async () => {
    renderer.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').props.onPress();
  });
const hostByTestId = (renderer: ReactTestRenderer.ReactTestRenderer, testID: string) =>
  renderer.root.findAll(node => typeof node.type === 'string' && node.props.testID === testID);
const registrations = () => request.mock.calls.filter(([path]) => path === '/notifications/devices');

beforeEach(() => {
  jest.clearAllMocks();
  unreadCount = 0;
  routeApi();
  (getToken as jest.Mock).mockResolvedValue('mock-fcm-token-0001');
  (getInitialNotification as jest.Mock).mockResolvedValue(null);
  (onTokenRefresh as jest.Mock).mockImplementation(() => jest.fn());
  (onMessage as jest.Mock).mockImplementation(() => jest.fn());
  (onNotificationOpenedApp as jest.Mock).mockImplementation(() => jest.fn());
});

test('does nothing while signed out', async () => {
  const renderer = await render(makeStore(false));
  expect(getToken).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('registers the FCM token on login and invalidates it on logout', async () => {
  const store = makeStore(false);
  const renderer = await render(store);
  await ReactTestRenderer.act(async () => { store.dispatch(setSession(session)); });
  await flush();
  expect(registrations()).toEqual([[
    '/notifications/devices',
    {method: 'POST', auth: 'required', body: JSON.stringify({token: 'mock-fcm-token-0001', platform: 'ios'})},
  ]]);

  await ReactTestRenderer.act(async () => { store.dispatch(clearSession()); });
  await flush();
  expect(deleteToken).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('re-registers when FCM rotates the token', async () => {
  const renderer = await render(makeStore(true));
  expect(registrations()).toHaveLength(1);
  const refresh = (onTokenRefresh as jest.Mock).mock.calls[0][1] as (token: string) => void;
  await ReactTestRenderer.act(async () => { refresh('rotated-fcm-token-0002'); });
  await flush();
  expect(registrations()).toHaveLength(2);
  expect(JSON.parse(registrations()[1][1].body)).toEqual({token: 'rotated-fcm-token-0002', platform: 'ios'});
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('shows the unread badge and refreshes it when a foreground push arrives', async () => {
  unreadCount = 3;
  const renderer = await render(makeStore(true));
  expect(hostByTestId(renderer, 'notifications-badge')).not.toHaveLength(0);
  expect(texts(renderer)).toContain('3');

  unreadCount = 120;
  const onPush = (onMessage as jest.Mock).mock.calls[0][1] as (message: unknown) => void;
  await ReactTestRenderer.act(async () => {
    onPush({messageId: 'm1', notification: {title: 'New message', body: 'Hi there'}, data: {type: 'NEW_MESSAGE', conversationId: 'c1'}});
  });
  await flush();
  expect(texts(renderer)).toContain('99+');
  // In-app banner, not a system notification.
  expect(texts(renderer)).toEqual(expect.arrayContaining(['New message', 'Hi there']));
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('bell opens the sheet; mark-all-read clears the list and badge', async () => {
  unreadCount = 2;
  const renderer = await render(makeStore(true));
  await press(renderer, 'Notifications, 2 unread');
  await flush();
  expect(requestPage).toHaveBeenCalledWith('/notifications?limit=20&offset=0', {auth: 'required'});
  expect(hostByTestId(renderer, 'notification-unread-dot')).toHaveLength(2);

  await press(renderer, 'Mark all notifications as read');
  await flush();
  expect(request).toHaveBeenCalledWith('/notifications/read', {method: 'POST', auth: 'required', body: '{}'});
  expect(hostByTestId(renderer, 'notification-unread-dot')).toHaveLength(0);
  expect(hostByTestId(renderer, 'notifications-badge')).toHaveLength(0);
  expect(texts(renderer)).toContain('All caught up');
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('a tapped push opens its target through the registered navigator', async () => {
  const onNavigate = jest.fn(() => true);
  const renderer = await render(makeStore(true), onNavigate);
  const opened = (onNotificationOpenedApp as jest.Mock).mock.calls[0][1] as (message: unknown) => void;
  await ReactTestRenderer.act(async () => { opened({data: {type: 'PARTY_INVITE', partyId: 'p1', kind: 'AUDIO'}}); });
  expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({kind: 'party', id: 'p1', type: 'PARTY_INVITE'}));
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('a push without a destination opens the notifications sheet', async () => {
  const onNavigate = jest.fn(() => true);
  (getInitialNotification as jest.Mock).mockResolvedValue({data: {type: 'CREDITS_LOW', workspaceId: 'w1'}});
  const renderer = await render(makeStore(true), onNavigate);
  await flush();
  expect(onNavigate).not.toHaveBeenCalled();
  expect(texts(renderer)).toContain('Notifications');
  expect(requestPage).toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
});
