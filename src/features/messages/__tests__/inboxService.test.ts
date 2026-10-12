import {apiRequest, apiRequestPage} from '../../../core/api/apiClient';
import {
  createFolder, deleteFolder, getFolders, getInbox, renameFolder, toInboxItem, updateConversationState, updatePartyState,
} from '../inboxService';
import type {ApiPartyChat, ApiPartyRequest} from '../types';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), apiRequestPage: jest.fn()}));
const request = apiRequest as jest.Mock;
const requestPage = apiRequestPage as jest.Mock;

const conversationRow = {
  id: 'c1', kind: 'DIRECT', status: 'OPEN', workspace_id: null, event_id: null, user_id: null, participant_a_id: 'me', participant_b_id: 'u2',
  last_message_at: '2026-10-07T10:00:00.000Z', created_at: '2026-10-01T10:00:00.000Z', event_title: null, event_starts_at: null,
  workspace_name: null, workspace_logo_url: null, other_user_id: 'u2', other_user_name: 'Ananya Sharma', other_user_avatar_url: null,
  unread_count: 2, folder_id: 'f1', is_pinned: true, is_archived: false, folder_name: 'Work',
};
const partyRow: ApiPartyChat = {
  id: 'p1', type: 'PARTY', kind: 'AUDIO', status: 'ACTIVE', title: ' Friday Jam ', topic: null, scheduled_start_at: null,
  created_at: '2026-10-05T10:00:00.000Z', ended_at: null, last_activity_at: '2026-10-07T09:00:00.000Z', host_id: 'h1', host_name: 'Dev',
  host_avatar_url: null, participant_count: 4, last_message: {id: 'pm1', body: 'Who is on mic?', sender_id: 'h1', created_at: '2026-10-07T09:00:00.000Z'},
  unread_count: '3', last_read_at: null, is_archived: false,
};
const requestRow: ApiPartyRequest = {
  id: 'r1', type: 'PARTY_REQUEST', party_id: 'p9', requester_id: 'u5', requester_name: 'Meera', requester_avatar_url: null, status: 'PENDING',
  requested_at: '2026-10-07T08:00:00.000Z', party_title: 'Late Night Talks', party_kind: 'AUDIO', host_id: 'me', host_name: 'Me',
};

beforeEach(() => { jest.resetAllMocks(); });

test('loads an offset page of the chosen view and discriminates rows by type', async () => {
  requestPage.mockResolvedValue({data: [conversationRow, partyRow, requestRow], meta: {view: 'ALL', limit: 20, offset: 20, hasMore: true}});
  const page = await getInbox({view: 'all'}, 20);
  expect(requestPage).toHaveBeenCalledWith('/conversations/inbox?view=all&limit=20&offset=20', {auth: 'required'});
  expect(page.hasMore).toBe(true);
  expect(page.nextOffset).toBe(23);
  expect(page.items.map(item => item.type)).toEqual(['CONVERSATION', 'PARTY', 'PARTY_REQUEST']);
  expect(page.items[0]).toMatchObject({id: 'c1', pinned: true, folderId: 'f1', folderName: 'Work', unreadCount: 2});
});

test('folder views send the folder id, other views never do', async () => {
  requestPage.mockResolvedValue({data: [], meta: {limit: 50, offset: 0, hasMore: false}});
  await getInbox({view: 'folder', folderId: 'a b'}, 0, 50);
  expect(requestPage).toHaveBeenLastCalledWith('/conversations/inbox?view=folder&folderId=a%20b&limit=50&offset=0', {auth: 'required'});
  await getInbox({view: 'requests', folderId: 'stale'}, 0);
  expect(requestPage).toHaveBeenLastCalledWith('/conversations/inbox?view=requests&limit=20&offset=0', {auth: 'required'});
});

test('maps party rooms and seat requests, tolerating missing names', () => {
  expect(toInboxItem(partyRow)).toEqual({
    type: 'PARTY', id: 'p1', title: 'Friday Jam', hostName: 'Dev', avatarUrl: null, participantCount: 4, unreadCount: 3,
    lastActivityAt: '2026-10-07T09:00:00.000Z', preview: 'Who is on mic?', archived: false, ended: false,
  });
  expect(toInboxItem({...partyRow, title: null, topic: 'Chill', host_name: null, ended_at: '2026-10-07T11:00:00.000Z', last_message: null}))
    .toMatchObject({title: 'Chill', hostName: 'Hiva user', preview: null, ended: true});
  expect(toInboxItem(requestRow)).toEqual({
    type: 'PARTY_REQUEST', id: 'r1', partyId: 'p9', requesterName: 'Meera', avatarUrl: null, partyTitle: 'Late Night Talks', requestedAt: '2026-10-07T08:00:00.000Z',
  });
});

test('folder calls use the folder endpoints', async () => {
  request.mockResolvedValue([]);
  await getFolders();
  expect(request).toHaveBeenLastCalledWith('/conversations/inbox/folders', {auth: 'required'});
  await createFolder('Work');
  expect(request).toHaveBeenLastCalledWith('/conversations/inbox/folders', {auth: 'required', method: 'POST', body: '{"name":"Work"}'});
  await renameFolder('f 1', 'Home');
  expect(request).toHaveBeenLastCalledWith('/conversations/inbox/folders/f%201', {auth: 'required', method: 'PATCH', body: '{"name":"Home"}'});
  await deleteFolder('f1');
  expect(request).toHaveBeenLastCalledWith('/conversations/inbox/folders/f1', {auth: 'required', method: 'DELETE'});
});

test('inbox state patches go to the per-user state endpoints', async () => {
  request.mockResolvedValue({});
  await updateConversationState('c1', {pinned: true, folderId: null});
  expect(request).toHaveBeenLastCalledWith('/conversations/inbox/c1/inbox-state', {auth: 'required', method: 'PATCH', body: '{"pinned":true,"folderId":null}'});
  await updatePartyState('p1', {read: false});
  expect(request).toHaveBeenLastCalledWith('/conversations/inbox/parties/p1/state', {auth: 'required', method: 'PATCH', body: '{"read":false}'});
});
