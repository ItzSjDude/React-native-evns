import {apiRequest} from '../../../core/api/apiClient';
import {ageInfoOf, deleteAccount, submitDateOfBirth} from '../age/ageService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn().mockResolvedValue({})}));
const request = apiRequest as jest.Mock;

test('sends the date of birth once as YYYY-MM-DD and deletes with the existing confirm contract', async () => {
  await submitDateOfBirth('1998-03-12');
  expect(request).toHaveBeenLastCalledWith('/auth/me', {auth: 'required', method: 'PATCH', body: JSON.stringify({dateOfBirth: '1998-03-12'})});
  await deleteAccount();
  expect(request).toHaveBeenLastCalledWith('/auth/me', {auth: 'required', method: 'DELETE', body: JSON.stringify({confirm: 'DELETE'})});
});

test('reads age fields from user or top level, and nothing from an older server', () => {
  expect(ageInfoOf({ageStatus: 'adult', dateOfBirthSet: true})).toEqual({ageStatus: 'adult', dateOfBirthSet: true});
  expect(ageInfoOf({user: {id: 'u', email: 'e', email_verified: true, ageStatus: 'minor', dateOfBirthSet: true}})).toEqual({ageStatus: 'minor', dateOfBirthSet: true});
  expect(ageInfoOf({id: 'u', email: 'e'})).toEqual({});
});
