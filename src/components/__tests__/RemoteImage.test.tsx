import React from 'react';
import {Image} from 'react-native';
import FastImage from 'react-native-fast-image';
import ReactTestRenderer from 'react-test-renderer';
import RemoteImage, {cacheModeFor, resizeModeToObjectFit} from '../RemoteImage';

const render = (element: React.ReactElement) => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(element); });
  return renderer;
};

test('maps resizeMode to objectFit', () => {
  expect(resizeModeToObjectFit('stretch')).toBe('fill');
  expect(resizeModeToObjectFit('center')).toBe('scale-down');
  expect(resizeModeToObjectFit('contain')).toBe('contain');
  expect(resizeModeToObjectFit('cover')).toBe('cover');
  expect(resizeModeToObjectFit('repeat')).toBe('cover');
  expect(resizeModeToObjectFit(undefined)).toBeUndefined();
});

test('only hashed or versioned, unsigned URLs are cached as immutable', () => {
  expect(cacheModeFor('https://cdn.example/avatars/u1/me.jpg')).toBe('web');
  expect(cacheModeFor('https://cdn.example/avatars/u1/me.jpg?v=3')).toBe('immutable');
  expect(cacheModeFor('https://cdn.example/m/5d41402abc4b2a76b9719d911017c592.webp')).toBe('immutable');
  expect(cacheModeFor('https://cdn.example/m/3f2b1c4e-1111-4222-8333-944455556666.jpg')).toBe('immutable');
  expect(cacheModeFor('https://b.s3.amazonaws.com/me.jpg?v=3&X-Amz-Signature=abc&X-Amz-Expires=60')).toBe('web');
});

test('remote URLs render FastImage with a stable source, objectFit and no fade when fadeDuration is 0', () => {
  const renderer = render(<RemoteImage uri="https://cdn.example/a.jpg" resizeMode="stretch" fadeDuration={0} accessibilityLabel="Avatar" style={{width: 10, height: 10}} />);
  const [node] = renderer.root.findAllByType(FastImage);
  expect(node.props).toMatchObject({source: {uri: 'https://cdn.example/a.jpg', priority: 'normal', cache: 'web'}, objectFit: 'fill', transition: false, accessibilityLabel: 'Avatar'});
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  const source = node.props.source;
  ReactTestRenderer.act(() => renderer.update(<RemoteImage uri="https://cdn.example/a.jpg" resizeMode="stretch" fadeDuration={0} accessibilityLabel="Avatar" style={{width: 10, height: 10}} />));
  expect(renderer.root.findAllByType(FastImage)[0].props.source).toBe(source);
});

test('data and file URIs stay on RN Image', () => {
  const renderer = render(<RemoteImage uri="data:image/png;base64,abc" resizeMode="contain" />);
  expect(renderer.root.findAllByType(FastImage)).toHaveLength(0);
  expect(renderer.root.findByType(Image).props).toMatchObject({source: {uri: 'data:image/png;base64,abc'}, resizeMode: 'contain'});
});

test('FastImage is wrapped by NativeWind so className reaches it through the style interop', () => {
  const renderer = render(<RemoteImage uri="https://cdn.example/a.jpg" className="h-10 w-10 rounded-full" />);
  // Jest has no compiled Tailwind CSS, so only the wrapper (registered once by cssInterop) can be asserted, not the resolved style.
  expect(renderer.root.findAll(node => (node.type as {displayName?: string}).displayName === 'CssInterop.FastImage')).toHaveLength(1);
});
