import {apiRequest, apiRequestPage} from '../../../core/api/apiClient';
import {cancelMyTicket, getMyTicket, listMyTickets} from '../ticketsService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), apiRequestPage: jest.fn()}));

const request = apiRequest as jest.Mock;
const page = apiRequestPage as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test('lists upcoming tickets with pagination', async () => {
  page.mockResolvedValue({data: [{id: 't1', code: 'HIVA-1'}], meta: {limit: 20, offset: 20, hasMore: true}});
  await expect(listMyTickets(20, 20, true)).resolves.toMatchObject({items: [{id: 't1'}], hasMore: true, offset: 20});
  expect(page).toHaveBeenCalledWith('/tickets?upcoming=true&limit=20&offset=20', {auth: 'required'});
});

test('loads signed QR image only through the authorized ticket detail endpoint', async () => {
  request.mockResolvedValue({id: 't1', qrImageDataUrl: 'data:image/png;base64,abc'});
  await getMyTicket('ticket/one');
  expect(request).toHaveBeenCalledWith('/tickets/ticket%2Fone?includeImage=true', {auth: 'required'});
});

test('cancels a ticket with a clear attendee reason', async () => {
  request.mockResolvedValue({id: 't1', status: 'CANCELLED'});
  await cancelMyTicket('t1');
  expect(request).toHaveBeenCalledWith('/tickets/t1/cancel', {
    auth: 'required', method: 'POST', body: JSON.stringify({reason: 'Cancelled by attendee'}),
  });
});
