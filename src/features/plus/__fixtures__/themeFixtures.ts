import type {ProfileThemeEntry} from '../types';

/** The server's default catalog for a free (`plus: false`) or Plus account. */
export const catalog = (plus: boolean): ProfileThemeEntry[] => [
  {id: 'default', name: 'Classic', access: 'FREE', available: true, owned: true},
  {id: 'aurora', name: 'Aurora', access: 'PLUS', available: plus, owned: plus},
  {id: 'midnight', name: 'Midnight', access: 'PLUS', available: plus, owned: plus},
];

/** A permanent pack on sale (productId present) that the account does not own yet. */
export const neonPack = (overrides: Partial<ProfileThemeEntry> = {}): ProfileThemeEntry =>
  ({id: 'neon', name: 'Neon', access: 'PURCHASE', available: true, owned: false, productId: 'theme_neon', ...overrides});
