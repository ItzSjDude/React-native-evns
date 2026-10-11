import {WEEKDAYS, dateToHHmm, deviceTimeZone, timeToDate, toHHmm, toggleDay} from '../quietHours';

test('HH:mm and HH:mm:ss convert to a Date and back', () => {
  expect(toHHmm('22:00:00')).toBe('22:00');
  expect(toHHmm('08:30')).toBe('08:30');
  const date = timeToDate('22:05:00', new Date(2026, 0, 10, 3, 4, 5, 6));
  expect([date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()]).toEqual([22, 5, 0, 0]);
  expect(dateToHHmm(date)).toBe('22:05');
  expect(dateToHHmm(new Date(2026, 0, 1, 7, 3))).toBe('07:03');
});

test('weekday numbering matches the backend (0 = Sunday), shown Monday first', () => {
  expect(WEEKDAYS.map(item => item.day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  expect(WEEKDAYS.find(item => item.day === 0)?.short).toBe('Sun');
});

test('toggleDay adds sorted, removes, and keeps the last day', () => {
  expect(toggleDay([0, 2], 1)).toEqual([0, 1, 2]);
  expect(toggleDay([0, 1, 2], 1)).toEqual([0, 2]);
  expect(toggleDay([3], 3)).toEqual([3]);
});

test('deviceTimeZone returns an IANA string', () => {
  expect(typeof deviceTimeZone()).toBe('string');
});
