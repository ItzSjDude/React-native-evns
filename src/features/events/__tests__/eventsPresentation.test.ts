import {actionMessageOf, messageOf} from '../eventsPresentation';

describe('actionMessageOf', () => {
  it('explains a 404 instead of echoing the server wording', () => {
    expect(actionMessageOf({status: 404, message: 'Not found'})).toMatch(/unavailable/i);
  });

  it('passes other errors through unchanged', () => {
    expect(actionMessageOf({status: 409, message: 'Sold out'})).toBe('Sold out');
    expect(actionMessageOf(undefined)).toBe(messageOf(undefined));
  });
});
