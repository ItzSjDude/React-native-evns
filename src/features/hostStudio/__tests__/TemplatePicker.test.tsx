import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import TemplatePicker from '../TemplatePicker';
import {resetAvailability} from '../availability';
import * as svc from '../hostStudioService';
import type {PartyTemplate} from '../types';

jest.mock('../hostStudioService', () => ({
  ...jest.requireActual('../hostStudioService'),
  listTemplates: jest.fn(), saveTemplate: jest.fn(), deleteTemplate: jest.fn(),
}));
const m = svc as unknown as Record<string, jest.Mock>;

const template = (id: string, name: string, config: PartyTemplate['config'] = {}): PartyTemplate => ({id, owner_user_id: 'u', name, config, created_at: '', updated_at: ''});
const flush = async () => {await act(async () => {await Promise.resolve(); await Promise.resolve();});};
let tree: ReactTestRenderer;
const find = (label: string) => tree.root.findByProps({accessibilityLabel: label});
const has = (label: string) => tree.root.findAllByProps({accessibilityLabel: label}).length > 0;
const press = async (label: string) => {await act(async () => {find(label).props.onPress();}); await flush();};
const text = () => tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join('')).join('|');
const onApply = jest.fn();
const mount = async () => {
  await act(async () => {tree = create(<TemplatePicker current={{title: 'Now', kind: 'VIDEO'}} onApply={onApply} />);});
  await flush();
};

beforeEach(() => {resetAvailability(); Object.values(m).forEach(fn => fn.mockReset?.()); onApply.mockReset();});
afterEach(() => act(() => tree?.unmount()));

test('lists templates and applies the chosen config', async () => {
  m.listTemplates.mockResolvedValue([template('t1', 'Friday jam', {title: 'Jam', kind: 'AUDIO'})]);
  await mount();
  await press('Use a template');
  await press('Apply template Friday jam');
  expect(onApply).toHaveBeenCalledWith({title: 'Jam', kind: 'AUDIO'});
});

test('saves the current form as a named template', async () => {
  m.listTemplates.mockResolvedValue([]);
  m.saveTemplate.mockResolvedValue(template('t2', 'Mine', {title: 'Now', kind: 'VIDEO'}));
  await mount();
  await press('Save as template');
  expect(find('Save template').props.disabled).toBe(true);
  await act(async () => {find('Template name').props.onChangeText('  Mine ');});
  await press('Save template');
  expect(m.saveTemplate).toHaveBeenCalledWith('Mine', {title: 'Now', kind: 'VIDEO'});
  await press('Use a template');
  expect(has('Apply template Mine')).toBe(true);
});

test('deletes a template', async () => {
  m.listTemplates.mockResolvedValue([template('t1', 'Old')]);
  m.deleteTemplate.mockResolvedValue(undefined);
  await mount();
  await press('Use a template');
  await press('Delete template Old');
  expect(m.deleteTemplate).toHaveBeenCalledWith('t1');
  expect(has('Apply template Old')).toBe(false);
});

test.each([[404], [403]])('hides entirely when the server answers %i', async status => {
  m.listTemplates.mockRejectedValue({status, message: 'nope'});
  await mount();
  expect(tree.toJSON()).toBeNull();
});

test('a failed save shows the server message and keeps the form', async () => {
  m.listTemplates.mockResolvedValue([]);
  m.saveTemplate.mockRejectedValue({status: 400, message: 'Invalid party template configuration'});
  await mount();
  await press('Save as template');
  await act(async () => {find('Template name').props.onChangeText('X');});
  await press('Save template');
  expect(text()).toContain('Invalid party template configuration');
  expect(has('Template name')).toBe(true);
});
