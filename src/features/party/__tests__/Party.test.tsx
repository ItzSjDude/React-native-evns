import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import Party from '../Party';
import {getPartyDiscoveryPage} from '../partyService';
import {PartySessionProvider} from '../PartySessionProvider';

jest.mock('@react-navigation/native', () => ({useIsFocused: () => true}));
jest.mock('../partyService', () => ({getPartyDiscoveryPage: jest.fn(), createParty: jest.fn()}));

const discover = getPartyDiscoveryPage as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  discover.mockResolvedValue({rooms: [], cursors: {audio: null, video: null}});
});

afterEach(()=>jest.useRealTimers());

test('loads audio parties and applies the music category to discovery', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<PartySessionProvider><Party /></PartySessionProvider>);
  });
  await ReactTestRenderer.act(async () => {
    await jest.runOnlyPendingTimersAsync();
  });
  expect(discover).toHaveBeenCalledWith({category: undefined, interest: undefined}, undefined);

  const music = renderer!.root.findByProps({accessibilityLabel: 'Music parties'});
  await ReactTestRenderer.act(async () => { music.props.onPress(); });
  await ReactTestRenderer.act(async () => { await jest.runOnlyPendingTimersAsync(); });
  expect(discover).toHaveBeenCalledWith({category: 'MUSIC', interest: undefined}, undefined);

  await ReactTestRenderer.act(async () => { renderer!.unmount(); });
});
