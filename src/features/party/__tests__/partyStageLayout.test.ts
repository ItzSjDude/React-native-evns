import {listenerStrip, moreSeatsLabel, planStage, roomMetaLabel, seatSlotLabel, speakerGrid, speakerLabel} from '../partyPresentation';

const person = (userId: string, seatIndex: number | null, role: 'HOST' | 'CO_HOST' | 'MEMBER' = 'MEMBER') => ({userId, seatIndex, role});

describe('speakerGrid', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('fits %i speakers in a 360dp screen', count => {
    const grid = speakerGrid(count, 328);
    expect(grid.columns).toBeLessThanOrEqual(4);
    expect(grid.rows).toBeLessThanOrEqual(2);
    expect(grid.columns * grid.rows).toBeGreaterThanOrEqual(count);
    expect(grid.cell * grid.columns).toBeLessThanOrEqual(328);
    expect(grid.size).toBeGreaterThanOrEqual(48);
    expect(grid.size).toBeLessThanOrEqual(grid.cell);
  });
  it('gives few speakers bigger avatars than many', () => {
    expect(speakerGrid(1, 328).size).toBeGreaterThan(speakerGrid(2, 328).size);
    expect(speakerGrid(2, 328).size).toBeGreaterThan(speakerGrid(4, 328).size);
    expect(speakerGrid(4, 328).size).toBeGreaterThanOrEqual(speakerGrid(8, 328).size);
  });
  it('is safe for bad input', () => {
    expect(speakerGrid(0, NaN).columns).toBe(1);
  });
});

describe('planStage', () => {
  it('shows every empty seat when there are few', () => {
    const plan = planStage(4, [person('h', 0, 'HOST')]);
    expect(plan.slots).toEqual([1, 2, 3]);
    expect(plan.hidden).toBe(0);
  });
  it('collapses many unused seats behind a count', () => {
    const plan = planStage(8, [person('h', 0, 'HOST')]);
    expect(plan.slots).toEqual([1, 2, 3]);
    expect(plan.hidden).toBe(4);
    expect(plan.slots.length + plan.hidden).toBe(7);
  });
  it('expands to every seat on demand', () => {
    const plan = planStage(8, [person('h', 0, 'HOST')], [], true);
    expect(plan.slots).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(plan.hidden).toBe(0);
  });
  it('keeps open seats ahead of locked ones when collapsing', () => {
    const plan = planStage(8, [person('h', 0, 'HOST')], [1, 2]);
    expect(plan.slots).toEqual([3, 4, 5]);
    expect(plan.hidden).toBe(4);
  });
  it('orders host, co-hosts, then members by seat', () => {
    const plan = planStage(8, [person('m', 1), person('c', 5, 'CO_HOST'), person('h', 3, 'HOST'), person('x', null)]);
    expect(plan.speakers.map(s => s.userId)).toEqual(['h', 'c', 'm']);
    expect(plan.slots).not.toContain(3);
  });
  it('has no slots when the stage is full', () => {
    const plan = planStage(2, [person('a', 0, 'HOST'), person('b', 1)]);
    expect(plan).toEqual({speakers: [{seatIndex: 0, userId: 'a'}, {seatIndex: 1, userId: 'b'}], slots: [], hidden: 0});
  });
});

describe('labels', () => {
  it('describes empty and locked seats', () => {
    expect(seatSlotLabel(2, false)).toBe('Open seat 3, tap to take it');
    expect(seatSlotLabel(3, true)).toBe('Locked seat 4');
  });
  it('describes speakers', () => {
    expect(speakerLabel('A', {mine: true, role: 'HOST'})).toBe('A, you, host, on stage');
    expect(speakerLabel(null, {mine: false, role: 'MEMBER', muted: true})).toBe('Guest, muted');
    expect(speakerLabel('B', {mine: false, role: 'CO_HOST', speaking: true})).toBe('B, co-host, speaking');
  });
  it('pluralises counts', () => {
    expect(moreSeatsLabel(1)).toBe('+ 1 more seat');
    expect(moreSeatsLabel(4)).toBe('+ 4 more seats');
    expect(roomMetaLabel(1, 1)).toBe('1 listener · 1 speaker');
    expect(roomMetaLabel(0, 3)).toBe('0 listeners · 3 speakers');
  });
  it('summarises the listeners strip', () => {
    expect(listenerStrip(3)).toEqual({shown: 3, overflow: 0});
    expect(listenerStrip(40)).toEqual({shown: 6, overflow: 34});
  });
});
