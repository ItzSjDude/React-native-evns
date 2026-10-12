import {createPartyShareLink, type PartyRoom} from '../partyService';
import {parsePartyLink, partyShareMessage} from '../partyLinks';

jest.mock('../partyService', () => ({createPartyShareLink: jest.fn()}));
const createLink = createPartyShareLink as jest.Mock;
const room = {id: 'party-1', title: 'Late night voices'} as PartyRoom;

beforeEach(() => {jest.resetAllMocks();});

test('accepts configured HTTPS room links and rejects lookalike origins', () => {
  const origin = 'https://links.example.test';
  expect(parsePartyLink(`${origin}/r/K7mP2qX9LdR4`, origin)).toBe('K7mP2qX9LdR4');
  expect(parsePartyLink(`${origin}/r/K7mP2qX9LdR4/`, origin)).toBe('K7mP2qX9LdR4');
  expect(parsePartyLink('https://evil.example/r/K7mP2qX9LdR4', origin)).toBeNull();
  expect(parsePartyLink(`https://links.example.test.evil.example/r/K7mP2qX9LdR4`, origin)).toBeNull();
  expect(parsePartyLink(`http://links.example.test/r/K7mP2qX9LdR4`, origin)).toBeNull();
  expect(parsePartyLink(`${origin}/r/K7mP2qX9Ld`, origin)).toBeNull();
});

test('keeps legacy custom-scheme links working', () => {
  expect(parsePartyLink('hiva://party/0123456789abcdef0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
  expect(parsePartyLink('hiva://party/short')).toBeNull();
});

test('shares the absolute URL returned by the backend', async () => {
  createLink.mockResolvedValue({shareToken: 'K7mP2qX9LdR4', link: 'https://links.example.test/r/K7mP2qX9LdR4'});
  await expect(partyShareMessage(room)).resolves.toBe('Late night voices\nhttps://links.example.test/r/K7mP2qX9LdR4');
  expect(createLink).toHaveBeenCalledWith('party-1');
});

test('does not share malformed or non-HTTPS backend links', async () => {
  createLink.mockResolvedValue({shareToken: 'K7mP2qX9LdR4', link: 'hiva://party/K7mP2qX9LdR4'});
  await expect(partyShareMessage(room)).rejects.toThrow('invalid party link');
});
