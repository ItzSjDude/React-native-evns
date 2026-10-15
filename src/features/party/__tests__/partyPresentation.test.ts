import {tagParts, buildPartyListItems, initialsOf, languageLabel, listenerLabel, participantStack, partyState} from '../partyPresentation';

describe('participantStack', () => {
  it('shows every avatar when the room is small', () => {
    expect(participantStack(0)).toEqual({shown: 0, overflow: 0});
    expect(participantStack(2)).toEqual({shown: 2, overflow: 0});
    expect(participantStack(3)).toEqual({shown: 3, overflow: 0});
  });
  it('collapses the rest into an overflow count', () => {
    expect(participantStack(4)).toEqual({shown: 3, overflow: 1});
    expect(participantStack(120)).toEqual({shown: 3, overflow: 117});
    expect(participantStack(10, 5)).toEqual({shown: 5, overflow: 5});
  });
  it('is safe for bad input', () => {
    expect(participantStack(-4)).toEqual({shown: 0, overflow: 0});
    expect(participantStack(NaN)).toEqual({shown: 0, overflow: 0});
  });
});

describe('partyState', () => {
  it('labels each status', () => {
    expect(partyState({status: 'ACTIVE', scheduledStartAt: null})).toEqual({label: 'Live', tone: 'live'});
    expect(partyState({status: 'SCHEDULED', scheduledStartAt: null})).toEqual({label: 'Scheduled', tone: 'scheduled'});
    expect(partyState({status: 'SCHEDULED', scheduledStartAt: '2030-01-02T10:00:00Z'})).toMatchObject({tone: 'scheduled'});
    expect(partyState({status: 'SCHEDULED', scheduledStartAt: '2030-01-02T10:00:00Z'}).label).toMatch(/^Starts /);
    expect(partyState({status: 'ENDED', scheduledStartAt: null})).toEqual({label: 'Ended', tone: 'ended'});
    expect(partyState({status: 'CANCELLED', scheduledStartAt: null})).toEqual({label: 'Cancelled', tone: 'ended'});
  });
});

describe('labels', () => {
  it('pluralises listeners', () => {
    expect(listenerLabel(1)).toBe('1 listening');
    expect(listenerLabel(0)).toBe('0 listening');
    expect(listenerLabel(7)).toBe('7 listening');
  });
  it('names languages', () => {
    expect(languageLabel('hi')).toBe('Hindi');
    expect(languageLabel('Hinglish')).toBe('Hinglish');
    expect(languageLabel('ta')).toBe('Ta');
    expect(languageLabel(null)).toBe('');
  });
  it('builds initials', () => {
    expect(initialsOf('  sam lee')).toBe('SA');
    expect(initialsOf(null)).toBe('?');
    expect(initialsOf('Zed', 1)).toBe('Z');
  });
});

describe('buildPartyListItems', () => {
  const room = (id: string, status: 'ACTIVE' | 'SCHEDULED') => ({id, status} as never);
  it('returns nothing for no rooms', () => expect(buildPartyListItems([])).toEqual([]));
  it('groups live and scheduled rooms under headers', () => {
    const items = buildPartyListItems([room('a', 'SCHEDULED'), room('b', 'ACTIVE'), room('c', 'ACTIVE')]);
    expect(items.map(item => item.key)).toEqual(['h-live', 'b', 'c', 'h-soon', 'a']);
    expect(items[0]).toMatchObject({type: 'header', title: 'Live now', count: 2});
    expect(items[3]).toMatchObject({type: 'header', title: 'Starting soon', count: 1});
  });
  it('omits an empty section', () => {
    expect(buildPartyListItems([room('a', 'SCHEDULED')]).map(item => item.key)).toEqual(['h-soon', 'a']);
  });
});

test('tagParts keeps dark variants on the right element', () => {
  const chill = tagParts('chill');
  expect(chill.box).toContain('dark:bg-[#32232B]');
  expect(chill.text).toBe('text-coral');
  expect(tagParts('other').text).toContain('dark:text-[#C2BECE]');
});
