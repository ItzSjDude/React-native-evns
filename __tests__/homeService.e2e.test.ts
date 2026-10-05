import {configureApiAuth} from '../src/core/api/apiClient';
import {createPost, deletePost, getPost, getPostFeed, likePost, unlikePost} from '../src/features/home/homeService';

const post = {
  id: 'post-1', body: 'Hello', media: [], visibility: 'PUBLIC' as const,
  createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z',
  author: {id: 'user-1', name: 'Asha', avatarUrl: null},
  reactions: {likeCount: 1, viewerHasLiked: false},
};

const reply = (status: number, data?: unknown) => ({
  ok: status >= 200 && status < 300, status,
  text: async () => status === 204 ? '' : JSON.stringify({success: true, data}),
});

describe('posts API end-to-end service flow', () => {
  beforeEach(() => {
    configureApiAuth({getAccessToken: async () => 'access-token', refreshAccessToken: async () => 'new-token', onSessionInvalid: async () => {}});
  });

  it('calls feed and preserves the opaque cursor response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(reply(200, {posts: [post], page: {limit: 20, hasMore: true, nextCursor: 'opaque-cursor'}})) as unknown as typeof fetch;
    await expect(getPostFeed()).resolves.toMatchObject({page: {nextCursor: 'opaque-cursor'}});
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/posts/feed?limit=20'), expect.objectContaining({headers: expect.any(Headers)}));
  });

  it('creates, reads, likes, unlikes, and deletes a post using contract routes', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce(reply(201, post))
      .mockResolvedValueOnce(reply(200, post))
      .mockResolvedValueOnce(reply(200, post.reactions))
      .mockResolvedValueOnce(reply(200, post.reactions))
      .mockResolvedValueOnce(reply(204)) as unknown as typeof fetch;

    await createPost({body: 'Hello'});
    await getPost('post-1');
    await likePost('post-1');
    await unlikePost('post-1');
    await deletePost('post-1');

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, expect.stringMatching(/\/posts$/), expect.objectContaining({method: 'POST', body: JSON.stringify({body: 'Hello'})}));
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, expect.stringMatching(/\/posts\/post-1$/), expect.objectContaining({headers: expect.any(Headers)}));
    expect(globalThis.fetch).toHaveBeenNthCalledWith(3, expect.stringMatching(/\/posts\/post-1\/reactions\/like$/), expect.objectContaining({method: 'POST'}));
    expect(globalThis.fetch).toHaveBeenNthCalledWith(4, expect.stringMatching(/\/posts\/post-1\/reactions\/like$/), expect.objectContaining({method: 'DELETE'}));
    expect(globalThis.fetch).toHaveBeenNthCalledWith(5, expect.stringMatching(/\/posts\/post-1$/), expect.objectContaining({method: 'DELETE'}));
  });
});
