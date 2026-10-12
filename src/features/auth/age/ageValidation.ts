import type {AgeGate, AgeStatus} from '../types';

export const MINIMUM_AGE = 18;
const MAXIMUM_AGE = 120;

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Picker state; `month` is 1-12. */
export type DobDraft = {day: number | null; month: number | null; year: number | null};

export const EMPTY_DOB: DobDraft = {day: null, month: null, year: null};

export type DobValidation =
  | {ok: true; isoDate: string; age: number; label: string}
  | {ok: false; error: string};

export const daysInMonth = (month: number, year: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const pad = (value: number) => String(value).padStart(2, '0');

/** "12 March 1998" — used in the confirmation prompt. */
export const formatDob = ({day, month, year}: {day: number; month: number; year: number}) =>
  `${day} ${MONTH_NAMES[month - 1]} ${year}`;

/** Whole years between the birth date and `today` (local calendar). */
export function ageOn(day: number, month: number, year: number, today: Date): number {
  let age = today.getFullYear() - year;
  const beforeBirthday = today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Validates a picked date of birth. Under-18 dates are valid input: the server decides the
 * account's status, and refusing them here would only teach people to pick another year.
 */
export function validateDob(draft: DobDraft, today: Date = new Date()): DobValidation {
  const {day, month, year} = draft;
  if (day == null || month == null || year == null) return {ok: false, error: 'Enter your full date of birth.'};
  if (day > daysInMonth(month, year)) return {ok: false, error: `${MONTH_NAMES[month - 1]} ${year} doesn't have ${day} days.`};
  const age = ageOn(day, month, year, today);
  const isFuture = year > today.getFullYear()
    || (year === today.getFullYear() && (month > today.getMonth() + 1 || (month === today.getMonth() + 1 && day > today.getDate())));
  if (isFuture) return {ok: false, error: "Your date of birth can't be in the future."};
  if (age > MAXIMUM_AGE) return {ok: false, error: 'Enter your real date of birth.'};
  return {ok: true, isoDate: `${year}-${pad(month)}-${pad(day)}`, age, label: formatDob({day, month, year})};
}

export const gateForStatus = (status: AgeStatus): AgeGate =>
  status === 'adult' ? 'none' : status === 'minor' ? 'minor' : 'confirm';

/** Gate after saving a DOB: trust the server; an older server says nothing, so fall back to the local age. */
export const gateAfterDobSaved = (status: AgeStatus | undefined, age: number): AgeGate =>
  status ? gateForStatus(status) : age < MINIMUM_AGE ? 'minor' : 'none';

export const DOB_NOTICE = "Hiva is for people 18 and over. Your date of birth can't be changed later.";
