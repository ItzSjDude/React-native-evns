import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import StudioSheet from '../StudioSheet';
import {resetAvailability, useStudioAvailable} from '../availability';
import * as svc from '../hostStudioService';
import type {PartyQuestion} from '../types';

jest.mock('../hostStudioService', () => ({
  ...jest.requireActual('../hostStudioService'),
  getRunOfShow: jest.fn(), saveRunOfShow: jest.fn(), listQuestions: jest.fn(), submitQuestion: jest.fn(), updateQuestion: jest.fn(),
}));
const m = svc as unknown as Record<string, jest.Mock>;

const question = (id: string, position: number, status: PartyQuestion['status'] = 'PENDING'): PartyQuestion =>
  ({id, party_id: 'p1', user_id: 'u', name: 'Asha', avatarUrl: null, body: `Question ${id}`, status, position, created_at: ''});
const flush = async () => {await act(async () => {await Promise.resolve(); await Promise.resolve();});};
let tree: ReactTestRenderer;
const find = (label: string) => all(label)[0];
const match = (n: {props: Record<string, unknown>} | null, label: string) => n?.props?.accessibilityLabel === label;
const all = (label: string) => tree.root.findAll(n => match(n, label) && !match(n.parent, label));
const has = (label: string) => all(label).length > 0;
const press = async (label: string, index = 0) => {await act(async () => {await all(label)[index].props.onPress();}); await flush();};
const text = () => tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join('')).join('|');
let available = true;
const Probe = () => {available = useStudioAvailable('p1', false, true); return null;};
const mount = async (manager: boolean) => {
  await act(async () => {tree = create(<><Probe /><StudioSheet partyId="p1" manager={manager} /></>);});
  await flush();
};

beforeEach(() => {
  resetAvailability(); Object.values(m).forEach(fn => fn.mockReset?.()); available = true;
  m.getRunOfShow.mockResolvedValue({party_id: 'p1', notes: 'Open with intro', updated_at: null}); m.listQuestions.mockResolvedValue([]);
});
afterEach(() => act(() => tree?.unmount()));

test('host sees notes, loads and saves them', async () => {
  m.saveRunOfShow.mockResolvedValue({party_id: 'p1', notes: 'New plan', updated_at: 'x'});
  await mount(true);
  expect(find('Run of show notes').props.value).toBe('Open with intro');
  await act(async () => {find('Run of show notes').props.onChangeText('New plan');});
  await press('Save notes');
  expect(m.saveRunOfShow).toHaveBeenCalledWith('p1', 'New plan');
  expect(text()).toContain('Notes saved');
});

test('audience never sees or requests the notes, only the ask box', async () => {
  await mount(false);
  expect(has('Run of show notes')).toBe(false);
  expect(has('Your question')).toBe(true);
  expect(m.getRunOfShow).not.toHaveBeenCalled();
  expect(m.listQuestions).not.toHaveBeenCalled();
});

test('a 403 on notes marks the room unavailable instead of crashing', async () => {
  m.getRunOfShow.mockRejectedValue({status: 403, message: 'Organizer Pro with the Host Studio capability is required'});
  await mount(true);
  expect(m.getRunOfShow).toHaveBeenCalled();
  // Probe watches the same room as an audience member would, so use the shared store directly.
  expect(available).toBe(false);
});

test('audience submits a question and the draft clears', async () => {
  m.submitQuestion.mockResolvedValue({id: 'q1', status: 'PENDING'});
  await mount(false);
  expect(find('Send question').props.disabled).toBe(true);
  await act(async () => {find('Your question').props.onChangeText('  What next? ');});
  await press('Send question');
  expect(m.submitQuestion).toHaveBeenCalledWith('p1', 'What next?');
  expect(find('Your question').props.value).toBe('');
  expect(text()).toContain('Question sent');
});

test('audience submit 404 (flag off) shows a message and hides the room entry', async () => {
  m.submitQuestion.mockRejectedValue({status: 404, message: 'Host Studio is unavailable'});
  await mount(false);
  expect(available).toBe(true);
  await act(async () => {find('Your question').props.onChangeText('Hi');});
  await press('Send question');
  expect(text()).toContain('Questions are not open in this room');
  expect(available).toBe(false);
});

test('host moderates: approve, answer, dismiss send the backend status enum', async () => {
  m.listQuestions.mockResolvedValue([question('q1', 0), question('q2', 1, 'APPROVED')]);
  m.updateQuestion.mockResolvedValue({});
  await mount(true);
  expect(text()).toContain('Question q1');
  expect(all('Approve')).toHaveLength(1); // only PENDING rows can be approved
  await press('Approve');
  expect(m.updateQuestion).toHaveBeenLastCalledWith('p1', 'q1', {status: 'APPROVED'});
  await press('Mark answered', 1);
  expect(m.updateQuestion).toHaveBeenLastCalledWith('p1', 'q2', {status: 'ANSWERED'});
  await press('Dismiss');
  expect(m.updateQuestion).toHaveBeenLastCalledWith('p1', 'q1', {status: 'DISMISSED'});
});

test('host reorders by swapping positions of neighbours', async () => {
  m.listQuestions.mockResolvedValue([question('q1', 3), question('q2', 7)]);
  m.updateQuestion.mockResolvedValue({});
  await mount(true);
  expect(all('Move up')[0].props.disabled).toBe(true);
  await press('Move up', 1);
  expect(m.updateQuestion).toHaveBeenCalledWith('p1', 'q2', {position: 3});
  expect(m.updateQuestion).toHaveBeenCalledWith('p1', 'q1', {position: 7});
});
