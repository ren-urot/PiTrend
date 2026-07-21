import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNewsComments } from '../../hooks/useNewsComments';
import { useCreateNewsComment } from '../../hooks/useCreateNewsComment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { NewsComment } from '../../types/news';

function NewsCommentNode({
  comment,
  allComments,
  articleId,
}: {
  comment: NewsComment;
  allComments: NewsComment[];
  articleId: string;
}) {
  const { session } = useAuth();
  const createComment = useCreateNewsComment();
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');

  const children = allComments.filter((candidate) => candidate.parent_comment_id === comment.id);

  async function submitReply() {
    if (!session || !replyBody.trim()) return;
    await createComment.mutateAsync({
      articleId,
      authorId: session.user.id,
      parentCommentId: comment.id,
      body: replyBody.trim(),
    });
    setReplyBody('');
    setReplying(false);
  }

  return (
    <div className="ml-4 border-l pl-3">
      <p className="text-sm font-medium">{comment.author.display_name}</p>
      <p className="text-sm">{comment.body}</p>
      <button
        type="button"
        className="text-xs text-muted-foreground"
        onClick={() => setReplying((v) => !v)}
      >
        Reply
      </button>
      {replying && (
        <div className="mt-1 flex gap-2">
          <Input
            placeholder="Write a reply…"
            value={replyBody}
            onChange={(event) => setReplyBody(event.target.value)}
          />
          <Button type="button" size="sm" onClick={submitReply}>
            Post
          </Button>
        </div>
      )}
      {children.map((child) => (
        <NewsCommentNode key={child.id} comment={child} allComments={allComments} articleId={articleId} />
      ))}
    </div>
  );
}

export function NewsCommentThread({ articleId }: { articleId: string }) {
  const { session } = useAuth();
  const { data: comments } = useNewsComments(articleId);
  const createComment = useCreateNewsComment();
  const [newBody, setNewBody] = useState('');

  const topLevel = (comments ?? []).filter((comment) => comment.parent_comment_id === null);

  async function submitTopLevel() {
    if (!session || !newBody.trim()) return;
    await createComment.mutateAsync({
      articleId,
      authorId: session.user.id,
      parentCommentId: null,
      body: newBody.trim(),
    });
    setNewBody('');
  }

  return (
    <div className="space-y-2 border-t pt-3">
      {topLevel.map((comment) => (
        <NewsCommentNode
          key={comment.id}
          comment={comment}
          allComments={comments ?? []}
          articleId={articleId}
        />
      ))}
      <div className="flex gap-2">
        <Input
          placeholder="Write a comment…"
          value={newBody}
          onChange={(event) => setNewBody(event.target.value)}
        />
        <Button type="button" size="sm" onClick={submitTopLevel}>
          Post
        </Button>
      </div>
    </div>
  );
}
