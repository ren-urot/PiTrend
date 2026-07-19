import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useToggleLike } from '../../hooks/useToggleLike';
import { useToggleBookmark } from '../../hooks/useToggleBookmark';
import { CommentThread } from './CommentThread';
import type { Post } from '../../types/post';

export function PostCard({ post }: { post: Post }) {
  const { session } = useAuth();
  const toggleLike = useToggleLike();
  const toggleBookmark = useToggleBookmark();
  const [showComments, setShowComments] = useState(false);

  const viewerId = session?.user.id;

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm">
          {post.author.display_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium">{post.author.display_name}</p>
          <p className="text-xs text-muted-foreground">@{post.author.username}</p>
        </div>
      </div>

      {post.body && <p className="mb-2 whitespace-pre-wrap">{post.body}</p>}

      {post.post_media && post.post_media.media_type === 'photo' && (
        <img
          src={post.post_media.media_url}
          alt=""
          className="mb-2 max-h-96 w-full rounded-md object-cover"
        />
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
