export type Option = {value: string; label: string};

export const GENDER_OPTIONS: Option[] = [
  {value: 'male', label: 'Male'},
  {value: 'female', label: 'Female'},
  {value: 'non_binary', label: 'Non-binary'},
  {value: 'prefer_not_to_say', label: 'Prefer not to say'},
];

export const PROFESSION_OPTIONS = ['Student', 'Developer', 'Designer', 'Creator', 'Business', 'Other'] as const;
export const OTHER_PROFESSION = 'Other';

/** "Why are you here?", each mapped to an existing Hiva feature. */
export const INTENT_OPTIONS: Option[] = [
  {value: 'meet_nearby', label: 'Meet people nearby'},
  {value: 'join_parties', label: 'Join live audio parties'},
  {value: 'find_events', label: 'Find events & tickets'},
  {value: 'network', label: 'Network at events'},
  {value: 'host_room', label: 'Host my own room or party'},
  {value: 'organise_events', label: 'Organise events'},
  {value: 'chat', label: 'Chat & make friends'},
  {value: 'explore', label: 'Just exploring'},
];

/** [name, ISO 3166-1 alpha-2]. The name is what gets stored; the code only drives the flag. */
export const COUNTRIES: [string, string][] = [
  ['Afghanistan', 'AF'], ['Albania', 'AL'], ['Algeria', 'DZ'], ['Argentina', 'AR'], ['Armenia', 'AM'],
  ['Australia', 'AU'], ['Austria', 'AT'], ['Azerbaijan', 'AZ'], ['Bahrain', 'BH'], ['Bangladesh', 'BD'],
  ['Belarus', 'BY'], ['Belgium', 'BE'], ['Bhutan', 'BT'], ['Bolivia', 'BO'], ['Bosnia and Herzegovina', 'BA'],
  ['Brazil', 'BR'], ['Bulgaria', 'BG'], ['Cambodia', 'KH'], ['Cameroon', 'CM'], ['Canada', 'CA'],
  ['Chile', 'CL'], ['China', 'CN'], ['Colombia', 'CO'], ['Costa Rica', 'CR'], ['Croatia', 'HR'],
  ['Cuba', 'CU'], ['Cyprus', 'CY'], ['Czechia', 'CZ'], ['Denmark', 'DK'], ['Dominican Republic', 'DO'],
  ['Ecuador', 'EC'], ['Egypt', 'EG'], ['El Salvador', 'SV'], ['Estonia', 'EE'], ['Ethiopia', 'ET'],
  ['Finland', 'FI'], ['France', 'FR'], ['Georgia', 'GE'], ['Germany', 'DE'], ['Ghana', 'GH'],
  ['Greece', 'GR'], ['Guatemala', 'GT'], ['Hong Kong', 'HK'], ['Hungary', 'HU'], ['Iceland', 'IS'],
  ['India', 'IN'], ['Indonesia', 'ID'], ['Iran', 'IR'], ['Iraq', 'IQ'], ['Ireland', 'IE'],
  ['Israel', 'IL'], ['Italy', 'IT'], ['Jamaica', 'JM'], ['Japan', 'JP'], ['Jordan', 'JO'],
  ['Kazakhstan', 'KZ'], ['Kenya', 'KE'], ['Kuwait', 'KW'], ['Latvia', 'LV'], ['Lebanon', 'LB'],
  ['Lithuania', 'LT'], ['Luxembourg', 'LU'], ['Malaysia', 'MY'], ['Maldives', 'MV'], ['Malta', 'MT'],
  ['Mexico', 'MX'], ['Moldova', 'MD'], ['Morocco', 'MA'], ['Myanmar', 'MM'], ['Nepal', 'NP'],
  ['Netherlands', 'NL'], ['New Zealand', 'NZ'], ['Nigeria', 'NG'], ['North Macedonia', 'MK'], ['Norway', 'NO'],
  ['Oman', 'OM'], ['Pakistan', 'PK'], ['Panama', 'PA'], ['Paraguay', 'PY'], ['Peru', 'PE'],
  ['Philippines', 'PH'], ['Poland', 'PL'], ['Portugal', 'PT'], ['Qatar', 'QA'], ['Romania', 'RO'],
  ['Russia', 'RU'], ['Saudi Arabia', 'SA'], ['Serbia', 'RS'], ['Singapore', 'SG'], ['Slovakia', 'SK'],
  ['Slovenia', 'SI'], ['South Africa', 'ZA'], ['South Korea', 'KR'], ['Spain', 'ES'], ['Sri Lanka', 'LK'],
  ['Sweden', 'SE'], ['Switzerland', 'CH'], ['Taiwan', 'TW'], ['Tanzania', 'TZ'], ['Thailand', 'TH'],
  ['Tunisia', 'TN'], ['Turkey', 'TR'], ['Uganda', 'UG'], ['Ukraine', 'UA'], ['United Arab Emirates', 'AE'],
  ['United Kingdom', 'GB'], ['United States', 'US'], ['Uruguay', 'UY'], ['Uzbekistan', 'UZ'], ['Venezuela', 'VE'],
  ['Vietnam', 'VN'], ['Zambia', 'ZM'], ['Zimbabwe', 'ZW'],
];

/** Flag emoji from an ISO code (regional-indicator letters). */
export const flagOf = (code: string) => String.fromCodePoint(...[...code].map(letter => 0x1f1a5 + letter.charCodeAt(0)));
