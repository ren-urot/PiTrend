import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useToggleLike } from '../../hooks/useToggleLike';
import { useToggleBookmark } from '../../hooks/useToggleBookmark';
import { useCreateRepost } from '../../hooks/useCreateRepost';
import { CommentThread } from './CommentThread';
import { PollOptionRow } from './PollOptionRow';
import type { Post } from '../../types/post';

export function PostCard({ post }: { post: Post }) {
  const { session } = useAuth();
  const toggleLike = useToggleLike();
  const toggleBookmark = useToggleBookmark();
  const createRepost = useCreateRepost();
  const [showComments, setShowComments] = useState(false);

  const viewerId = session?.user.id;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm">
          {post.author.display_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium">{post.author.display_name}</p>
          <p className="text-xs text-muted-foreground">@{post.author.username}</p>
        </div>
      </div>

      {post.post_type === 'repost' && (
        <div className="mb-2">
          <p className="mb-1 text-xs text-muted-foreground">🔁 shared a post</p>
          {post.shared_post ? (
            <div className="rounded-md border p-2">
              <p className="text-xs font-medium">{post.shared_post.author.display_name}</p>
              {post.shared_post.body && <p className="text-sm">{post.shared_post.body}</p>}
              {post.shared_post.post_media && post.shared_post.post_media.media_type === 'photo' && (
                <img
                  src={post.shared_post.post_media.media_url}
                  alt=""
                  className="mt-1 max-h-64 w-full rounded object-cover"
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This post is no longer available.</p>
          )}
        </div>
      )}

      {post.body && <p className="mb-2 whitespace-pre-wrap">{post.body}</p>}

      {post.post_media && post.post_media.media_type === 'photo' && (
        <img
          src={post.post_media.media_url}
          alt=""
          className="mb-2 max-h-96 w-full rounded-md object-cover"
        />
      )}

      {post.post_media && post.post_media.media_type === 'video' && (
        <video
          src={post.post_media.media_url}
          controls
          className="mb-2 max-h-96 w-full rounded-md"
        />
      )}

      {post.buy_sell && (
        <p className="mb-2 text-sm font-medium">
          {post.buy_sell.price_currency} {post.buy_sell.price_amount} · {post.buy_sell.category}
        </p>
      )}

      {post.poll && (
        <div className="mb-2 flex flex-col gap-1">
          {post.poll.options.map((option) => (
            <PollOptionRow key={option.id} option={option} post={post} />
          ))}
        </div>
      )}

      <div className="flex gap-4 text-sm text-muted-foreground">
        <button
          type="button"
          disabled={!viewerId}
          onClick={() =>
            viewerId &&
            toggleLike.mutate({
              postId: post.id,
              userId: viewerId,
              isLiked: post.viewer_has_liked,
              cityId: post.city_id,
              channelId: post.channel_id,
            })
          }
        >
          {post.viewer_has_liked ? 'Liked' : 'Like'} ({post.like_count})
        </button>
        <button type="button" onClick={() => setShowComments((value) => !value)}>
          Comment ({post.comment_count})
        </button>
        <button
          type="button"
          disabled={!viewerId}
          onClick={() =>
            viewerId &&
            createRepost.mutate({
              authorId: viewerId,
              cityId: post.city_id,
              channelId: post.channel_id,
              sharedPostId: post.id,
            })
          }
        >
          Share
        </button>
        <button
          type="button"
          disabled={!viewerId}
          onClick={() =>
            viewerId &&
            toggleBookmark.mutate({
              postId: post.id,
              userId: viewerId,
              isBookmarked: post.viewer_has_bookmarked,
              cityId: post.city_id,
              channelId: post.channel_id,
            })
          }
        >
          {post.viewer_has_bookmarked ? 'Bookmarked' : 'Bookmark'}
        </button>
      </div>

      {showComments && <CommentThread postId={post.id} />}
    </div>
  );
}
