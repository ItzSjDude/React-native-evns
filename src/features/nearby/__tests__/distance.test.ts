import {bandForMeters, distanceLabel} from '../distance';
import {nearbyErrorMessage} from '../nearbyErrors';

test('labels every server band', () => {
  expect(distanceLabel({distanceBand: '<500m', distanceMeters: 500})).toBe('Within 500 m');
  expect(distanceLabel({distanceBand: '<1km', distanceMeters: 1000})).toBe('Under 1 km');
  expect(distanceLabel({distanceBand: '<2km', distanceMeters: 2000})).toBe('Under 2 km');
  expect(distanceLabel({distanceBand: '<5km', distanceMeters: 5000})).toBe('Under 5 km');
  expect(distanceLabel({distanceBand: '<10km', distanceMeters: 10000})).toBe('Under 10 km');
  expect(distanceLabel({distanceBand: '10km+', distanceMeters: 12000})).toBe('Over 10 km');
});

test('the band wins over coarse metres', () => {
  expect(distanceLabel({distanceBand: '<500m', distanceMeters: 750})).toBe('Within 500 m');
});

test('derives a band from distanceMeters on servers that send none, never exact metres', () => {
  expect(distanceLabel({distanceMeters: 37})).toBe('Within 500 m');
  expect(distanceLabel({distanceMeters: 499.9})).toBe('Within 500 m');
  expect(distanceLabel({distanceMeters: 500})).toBe('Under 1 km');
  expect(distanceLabel({distanceMeters: 1500})).toBe('Under 2 km');
  expect(distanceLabel({distanceMeters: 4999})).toBe('Under 5 km');
  expect(distanceLabel({distanceMeters: 9000})).toBe('Under 10 km');
  expect(distanceLabel({distanceMeters: 25000})).toBe('Over 10 km');
  expect(bandForMeters(Number.NaN)).toBe('<500m');
});

test('an unrecognised band falls back to metres', () => {
  expect(distanceLabel({distanceBand: 'nearby' as never, distanceMeters: 3000})).toBe('Under 5 km');
});

test('friendly errors for rate limits and implausible locations', () => {
  expect(nearbyErrorMessage({status: 429, message: 'Too many requests'})).toBe('Slow down a bit — try again in a minute.');
  expect(nearbyErrorMessage({status: 422, code: 'LOCATION_IMPLAUSIBLE', message: 'x'})).toMatch(/couldn't be verified/);
  expect(nearbyErrorMessage({status: 500, message: 'Boom'})).toBe('Boom');
  expect(nearbyErrorMessage(null)).toBe('Please try again.');
});
