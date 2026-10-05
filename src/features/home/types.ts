export type HomePost = {
  id: string;
  authorId: string;
  author: string;
  avatarUrl?: string | null;
  time: string;
  content: string;
  likes: number;
  likedByViewer?: boolean;
  comments?: number;
  shares?: number;
  images?: string[];
};

export type HomeComment = {
  id: string;
  body: string;
  createdAt: string;
  author: {id: string; name: string; avatarUrl: string | null};
};

export type PostMedia = {url: string; type: 'IMAGE'};

export type SelectedPostImage = {
  uri: string;
  type: string;
  fileName?: string;
};

export type ApiPost = {
  id: string;
  body: string;
  media: PostMedia[];
  visibility: 'PUBLIC';
  createdAt: string;
  updatedAt: string;
  author: {id: string; name: string; avatarUrl: string | null};
  reactions: {likeCount: number; viewerHasLiked: boolean};
};

export type PostFeed = {
  posts: ApiPost[];
  page: {limit: number; hasMore: boolean; nextCursor: string | null};
};

export type CreatePostInput = {body?: string; media?: PostMedia[]};
