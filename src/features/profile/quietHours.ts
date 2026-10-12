/** Pure helpers for the quiet-hours settings. The backend stores 'HH:mm:ss' and accepts 'HH:mm' or 'HH:mm:ss'. */

/** Backend weekday numbering is JS `Date#getDay` (0 = Sunday); shown Monday first. */
export const WEEKDAYS: {day: number; label: string; short: string}[] = [
  {day: 1, label: 'Monday', short: 'Mon'}, {day: 2, label: 'Tuesday', short: 'Tue'}, {day: 3, label: 'Wednesday', short: 'Wed'},
  {day: 4, label: 'Thursday', short: 'Thu'}, {day: 5, label: 'Friday', short: 'Fri'}, {day: 6, label: 'Saturday', short: 'Sat'},
  {day: 0, label: 'Sunday', short: 'Sun'},
];

/** 'HH:mm:ss' or 'HH:mm' to 'HH:mm'. */
export const toHHmm = (time: string) => time.slice(0, 5);

/** Today at the given 'HH:mm[:ss]' in the device's zone, for seeding a native time picker. */
export function timeToDate(time: string, base = new Date()) {
  const [hours = 0, minutes = 0] = toHHmm(time).split(':').map(Number);
  const date = new Date(base);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** The picked wall-clock time as 'HH:mm'. */
export const dateToHHmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Adds or removes a day, sorted. The last remaining day can't be removed: an empty list would make quiet hours a silent no-op. */
export function toggleDay(days: number[], day: number) {
  if (!days.includes(day)) return [...days, day].sort((a, b) => a - b);
  return days.length > 1 ? days.filter(item => item !== day) : days;
}

/** The device's IANA zone, or undefined if the runtime has no Intl zone support. */
export const deviceTimeZone = () => {
  try {return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;}
  catch {return undefined;}
};
