import React from 'react';
import {Text, TextInput} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {showDialog} from '../../../components/Dialog';
import {FolderManagerSheet} from '../InboxSheets';
import * as inbox from '../inboxService';
import type {InboxFolder} from '../types';

jest.mock('../../../components/Dialog', () => ({showDialog: jest.fn()}));
jest.mock('../inboxService', () => ({
  ...jest.requireActual('../inboxService'),
  createFolder: jest.fn(), renameFolder: jest.fn(), deleteFolder: jest.fn(),
}));

const folder = (id: string, name: string): InboxFolder => ({id, name, createdAt: '', updatedAt: ''});
const create = inbox.createFolder as jest.Mock;
const rename = inbox.renameFolder as jest.Mock;
const remove = inbox.deleteFolder as jest.Mock;
const texts = (renderer: ReactTestRenderer.ReactTestRenderer) => renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

const setup = async (folders: InboxFolder[], plusRequired = jest.fn(() => false)) => {
  const onChange = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<FolderManagerSheet visible folders={folders} onClose={jest.fn()} onChange={onChange} onPlusRequired={plusRequired} />);
  });
  const press = async (label: string) => ReactTestRenderer.act(async () => {
    renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0].props.onPress();
  });
  const type = async (value: string) => ReactTestRenderer.act(async () => { renderer.root.findByType(TextInput).props.onChangeText(value); });
  return {renderer: renderer!, onChange, press, type, plusRequired};
};

beforeEach(() => { jest.clearAllMocks(); });

test('creates a folder with the trimmed name', async () => {
  create.mockResolvedValue(folder('f2', 'Home'));
  const {renderer, onChange, press, type} = await setup([folder('f1', 'Work')]);
  await type('  Home ');
  await press('Create folder');
  expect(create).toHaveBeenCalledWith('Home');
  expect(onChange).toHaveBeenCalledWith([folder('f1', 'Work'), folder('f2', 'Home')]);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('shows the server message for a duplicate name (409) and keeps the folders', async () => {
  create.mockRejectedValue({status: 409, message: 'A folder with that name already exists'});
  const {renderer, onChange, press, type} = await setup([folder('f1', 'Work')]);
  await type('work');
  await press('Create folder');
  expect(texts(renderer)).toContain('A folder with that name already exists');
  expect(onChange).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('at 10 folders creating is disabled with an explanation', async () => {
  const ten = Array.from({length: 10}, (_, i) => folder(`f${i}`, `Folder ${i}`));
  const {renderer, press, type} = await setup(ten);
  await type('One more');
  await press('Create folder');
  expect(create).not.toHaveBeenCalled();
  expect(texts(renderer)).toContain('You can have up to 10 folders. Delete one to add another.');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('renames a folder from its row', async () => {
  rename.mockResolvedValue(folder('f1', 'Office'));
  const {renderer, onChange, press, type} = await setup([folder('f1', 'Work')]);
  await press('Rename Work');
  await type('Office');
  await press('Save name');
  expect(rename).toHaveBeenCalledWith('f1', 'Office');
  expect(onChange).toHaveBeenCalledWith([folder('f1', 'Office')]);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('delete asks first, then removes the folder', async () => {
  remove.mockResolvedValue({deleted: true});
  const {renderer, onChange, press} = await setup([folder('f1', 'Work'), folder('f2', 'Home')]);
  await press('Delete Work');
  const buttons = (showDialog as jest.Mock).mock.calls[0][2] as {text: string; onPress?: () => void}[];
  expect(remove).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { buttons.find(button => button.text === 'Delete')!.onPress!(); });
  expect(remove).toHaveBeenCalledWith('f1');
  expect(onChange).toHaveBeenCalledWith([folder('f2', 'Home')]);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('a 403 PLUS_REQUIRED is handed to the owner instead of shown as an error', async () => {
  create.mockRejectedValue({status: 403, code: 'PLUS_REQUIRED', message: 'Hiva Plus is required'});
  const plusRequired = jest.fn(() => true);
  const {renderer, press, type} = await setup([], plusRequired);
  await type('Work');
  await press('Create folder');
  expect(plusRequired).toHaveBeenCalled();
  expect(texts(renderer)).not.toContain('Hiva Plus is required');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});
