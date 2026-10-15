import React, {memo, useMemo} from 'react';
import {Image, type ImageProps, type ImageResizeMode} from 'react-native';
import FastImage, {type Cache, type FastImageProps, type ObjectFit, type Priority} from 'react-native-fast-image';
import {cssInterop} from 'nativewind';

// FastImage is not a core RN component, so NativeWind needs to be told once that `className` maps to `style`.
cssInterop(FastImage, {className: 'style'});

/** FastImage v10 replaced `resizeMode` with CSS-style `objectFit`; `repeat` (tiling) is gone, so it falls back to `cover`. */
export function resizeModeToObjectFit(mode: ImageResizeMode | undefined): ObjectFit | undefined {
  switch (mode) {
    case 'stretch': return 'fill';
    case 'center': return 'scale-down';
    case 'contain': return 'contain';
    case 'cover':
    case 'repeat': return 'cover';
    default: return undefined;
  }
}

const isHttpUrl = (uri: string) => /^https?:\/\//i.test(uri);

// Signed / expiring URLs must never be treated as immutable: the same object comes back under a new signature.
const SIGNED_URL = /[?&](x-amz-[^=]*|x-goog-[^=]*|signature|sig|token|expires|policy|key-pair-id|se|sp)=/i;
// A version/hash query param, or a file name that is itself a content hash / UUID, means the bytes behind the URL never change.
const VERSIONED_QUERY = /[?&](v|ver|version|rev|hash|etag)=[^&#]+/i;
const HASHED_FILENAME = /\/[^/?#]*(?:[0-9a-f]{32,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[^/?#]*(?:[?#]|$)/i;

/**
 * `immutable` (load once, never revalidate) only for URLs that carry a content hash or version; everything else
 * follows the server's HTTP cache headers (`web`) so an avatar replaced in place still refreshes.
 */
export function cacheModeFor(uri: string): Cache {
  if (SIGNED_URL.test(uri)) return 'web';
  return VERSIONED_QUERY.test(uri) || HASHED_FILENAME.test(uri) ? 'immutable' : 'web';
}

/**
 * Image for a remote URL whose `source` object is stable across re-renders, so list rows don't hand the native image a fresh prop each time.
 * http(s) URLs render through react-native-fast-image; anything else (data:, file://, content://) stays on RN `Image`.
 * RN-only props are translated: `resizeMode` -> `objectFit`, `fadeDuration={0}` -> `transition={false}`.
 */
type RemoteImageProps = Omit<ImageProps, 'source'> & {
  uri: string;
  /** Load order hint; use `high` for above-the-fold images such as the signed-in user's avatar. */
  priority?: Priority;
  /** Overrides the cache mode inferred from the URL (see `cacheModeFor`). */
  cache?: Cache;
  /** Cache under a stable key instead of the URL (only for `immutable`; ignored by `web`). */
  cacheKey?: string;
  /** Overrides the fade derived from `fadeDuration`. `false` disables the Android fade-in. */
  transition?: FastImageProps['transition'];
  objectFit?: ObjectFit;
};

const RemoteImage = memo(function RemoteImageView({uri, priority = 'normal', cache, cacheKey, transition, objectFit, resizeMode, fadeDuration, resizeMethod: _resizeMethod, progressiveRenderingEnabled: _progressive, ...props}: RemoteImageProps) {
  const remote = isHttpUrl(uri);
  const plainSource = useMemo(() => ({uri}), [uri]);
  const fastSource = useMemo(
    () => ({uri, priority, cache: cache ?? cacheModeFor(uri), ...(cacheKey ? {cacheKey} : null)}),
    [uri, priority, cache, cacheKey],
  );

  if (!remote) return <Image source={plainSource} resizeMode={resizeMode} fadeDuration={fadeDuration} {...props} />;

  // Android FastImage fades in by default (300ms); callers that opted out via fadeDuration={0} keep the no-fade behaviour.
  const fade = transition ?? (fadeDuration === 0 ? false : fadeDuration ? fadeDuration : undefined);
  return <FastImage source={fastSource} objectFit={objectFit ?? resizeModeToObjectFit(resizeMode)} transition={fade} {...(props as Omit<FastImageProps, 'source'>)} />;
});

export default RemoteImage;
