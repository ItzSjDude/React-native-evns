export type HomeComment = {
  id: string;
  body: string;
  createdAt: string;
  author: {id: string; name: string; avatarUrl: string | null};
};

export type HomePost = {
  id: string;
  author: string;
  time: string;
  content: string;
  likes: number;
  likedByViewer?: boolean;
  comments?: number;
  shares?: number;
  images?: string[];
};
