import {listenerStrip, roomMetaLabel} from '../partyPresentation';

describe('room header labels', () => {
  it('pluralises counts', () => {
    expect(roomMetaLabel(1, 1)).toBe('1 listener · 1 speaker');
    expect(roomMetaLabel(0, 3)).toBe('0 listeners · 3 speakers');
  });
  it('summarises the listeners strip', () => {
    expect(listenerStrip(3)).toEqual({shown: 3, overflow: 0});
    expect(listenerStrip(40)).toEqual({shown: 6, overflow: 34});
  });
});
