import type {PostCardData} from '../../Constants/UI/PostCard';
import type {HomePost} from './types';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Compact feed timestamp: "now", "5m", "3h", "2d", "4w", then a date. */
export const formatRelativeTime = (iso: string, now = Date.now()): string => {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const diff = Math.max(0, now - time);
  if (diff < MINUTE) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`;
  if (diff < 5 * WEEK) return `${Math.floor(diff / WEEK)}w`;
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? {month: 'short', day: 'numeric'} : {month: 'short', day: 'numeric', year: 'numeric'});
};

export const toPostCardData = (post: HomePost, viewerId: string | null, now = Date.now()): PostCardData => ({
  id: post.id,
  author: post.author,
  authorAvatarUrl: post.authorAvatarUrl,
  authorIsPlus: post.authorIsPlus,
  time: post.pending ? 'Posting...' : formatRelativeTime(post.createdAt, now),
  content: post.content,
  images: post.images,
  likes: post.likes,
  likedByViewer: post.likedByViewer,
  comments: post.comments,
  shares: post.shares,
  pending: post.pending,
  canDelete: !post.pending && viewerId !== null && post.authorId === viewerId,
});

export const messageOf = (error: unknown) => (error as {message?: string})?.message || 'Please try again.';
