import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import PartyRoomCard from '../PartyRoomCard';
import {PartyStateView} from '../PartyBits';
import type {PartyRoom} from '../partyService';

const base: PartyRoom = {
  id: 'r1', kind: 'AUDIO', status: 'ACTIVE', title: 'Late night lofi', topic: 'Chill beats and chat', category: 'MUSIC', language: 'hi',
  interestTags: ['chill'], host: {id: 'h', name: 'Asha', avatarUrl: null}, participantCount: 12, scheduledStartAt: null,
};
const texts = (tree: ReactTestRenderer.ReactTestRenderer) => JSON.stringify(tree.toJSON());
const render = (room: PartyRoom) => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => { tree = ReactTestRenderer.create(<PartyRoomCard room={room} onOpen={jest.fn()} onMore={jest.fn()} />); });
  return tree;
};

test('live card shows state, language, listener count, overflow and a Join action', () => {
  const tree = render(base);
  const out = texts(tree);
  expect(out).toContain('Live');
  expect(out).toContain('Hindi');
  expect(out).toContain('12 listening');
  expect(out).toContain('"+","9"');
  expect(tree.root.findByProps({accessibilityLabel: 'Join Late night lofi'})).toBeTruthy();
  expect(tree.root.findByProps({accessibilityLabel: '12 participants, hosted by Asha'})).toBeTruthy();
});

test('scheduled card offers Details instead of Join and has no listener line', () => {
  const tree = render({...base, status: 'SCHEDULED', scheduledStartAt: '2030-01-02T10:00:00Z'});
  expect(texts(tree)).toContain('Starts ');
  expect(texts(tree)).not.toContain('listening');
  expect(tree.root.findByProps({accessibilityLabel: 'View Late night lofi'})).toBeTruthy();
});

test('ended card is view-only', () => {
  const tree = render({...base, status: 'ENDED'});
  expect(texts(tree)).toContain('Ended');
  expect(tree.root.findByProps({accessibilityLabel: 'View Late night lofi'})).toBeTruthy();
});

test('state view runs its primary action', () => {
  const onPress = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => { tree = ReactTestRenderer.create(<PartyStateView kind="error" title="Oops" message="Failed" actions={[{label: 'Try again', accessibilityLabel: 'Retry party rooms', onPress}]} />); });
  tree.root.findByProps({accessibilityLabel: 'Retry party rooms'}).props.onPress();
  expect(onPress).toHaveBeenCalled();
});
