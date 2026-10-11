import {apiRequest} from '../../../core/api/apiClient';
import {
  buildTemplate, deleteTemplate, errorMessage, getRunOfShow, isUnavailable, isValidNotes, isValidQuestion, listQuestions, listTemplates,
  saveRunOfShow, saveTemplate, submitQuestion, updateQuestion,
} from '../hostStudioService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;
beforeEach(() => {jest.resetAllMocks(); request.mockResolvedValue({});});

test('endpoints use the documented paths, verbs and bodies', async () => {
  await listTemplates();
  expect(request).toHaveBeenLastCalledWith('/host-studio/templates', {auth: 'required'});
  await saveTemplate('Friday', {kind: 'AUDIO'});
  expect(request).toHaveBeenLastCalledWith('/host-studio/templates', {auth: 'required', method: 'POST', body: JSON.stringify({name: 'Friday', config: {kind: 'AUDIO'}})});
  await deleteTemplate('t1');
  expect(request).toHaveBeenLastCalledWith('/host-studio/templates/t1', {auth: 'required', method: 'DELETE'});
  await getRunOfShow('p1');
  expect(request).toHaveBeenLastCalledWith('/host-studio/parties/p1/run-of-show', {auth: 'required'});
  await saveRunOfShow('p1', 'intro');
  expect(request).toHaveBeenLastCalledWith('/host-studio/parties/p1/run-of-show', {auth: 'required', method: 'PUT', body: JSON.stringify({notes: 'intro'})});
  await listQuestions('p1');
  expect(request).toHaveBeenLastCalledWith('/host-studio/parties/p1/questions', {auth: 'required'});
  await submitQuestion('p1', 'Why?');
  expect(request).toHaveBeenLastCalledWith('/host-studio/parties/p1/questions', {auth: 'required', method: 'POST', body: JSON.stringify({body: 'Why?'})});
  await updateQuestion('p1', 'q1', {status: 'APPROVED', position: 2});
  expect(request).toHaveBeenLastCalledWith('/host-studio/parties/p1/questions/q1', {auth: 'required', method: 'PATCH', body: JSON.stringify({status: 'APPROVED', position: 2})});
});

test('buildTemplate respects backend limits and drops empties', () => {
  expect(buildTemplate('   ', {})).toBeNull();
  expect(buildTemplate('x'.repeat(61), {})).toBeNull();
  const built = buildTemplate(' Weekly ', {
    title: ' ' + 'a'.repeat(130), topic: '  ', category: 'MUSIC', language: 'L'.repeat(30), kind: 'AUDIO', visibility: 'PRIVATE', seatCount: 99,
    interestTags: Array.from({length: 12}, (_, i) => ` tag${i} `).concat(['  ']),
  })!;
  expect(built.name).toBe('Weekly');
  expect(built.config.title).toHaveLength(120);
  expect(built.config).not.toHaveProperty('topic');
  expect(built.config.language).toHaveLength(20);
  expect(built.config.seatCount).toBe(8);
  expect(built.config.interestTags).toHaveLength(10);
  expect(built.config.interestTags![0]).toBe('tag0');
});

test('validation and error helpers', () => {
  expect(isValidQuestion('  ')).toBe(false);
  expect(isValidQuestion('x'.repeat(501))).toBe(false);
  expect(isValidQuestion('ok')).toBe(true);
  expect(isValidNotes('x'.repeat(10001))).toBe(false);
  expect(isUnavailable({status: 404})).toBe(true);
  expect(isUnavailable({status: 403})).toBe(true);
  expect(isUnavailable({status: 400})).toBe(false);
  expect(errorMessage({message: 'bad'}, 'fb')).toBe('bad');
  expect(errorMessage(null, 'fb')).toBe('fb');
});
