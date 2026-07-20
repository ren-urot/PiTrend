import { useAuth } from '../../hooks/useAuth';
import { useVoteOnPoll } from '../../hooks/useVoteOnPoll';
import type { Post, PollOption } from '../../types/post';

export function PollOptionRow({ option, post }: { option: PollOption; post: Post }) {
  const { session } = useAuth();
  const voteOnPoll = useVoteOnPoll();
  const viewerId = session?.user.id;

  const hasVoted = post.poll?.viewer_vote_option_id != null;
  const totalVotes = post.poll?.options.reduce((sum, o) => sum + o.vote_count, 0) ?? 0;
  const percentage = totalVotes > 0 ? Math.round((option.vote_count / totalVotes) * 100) : 0;

  if (hasVoted) {
    const isViewerChoice = option.id === post.poll?.viewer_vote_option_id;
    return (
      <div className="rounded border px-2 py-1 text-sm">
        <div className="flex justify-between">
          <span>
            {option.option_text}
            {isViewerChoice ? ' ✓' : ''}
          </span>
          <span>{percentage}%</span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!viewerId}
      className="rounded border px-2 py-1 text-left text-sm"
      onClick={() =>
        viewerId &&
        voteOnPoll.mutate({
          postId: post.id,
          pollOptionId: option.id,
          voterId: viewerId,
          cityId: post.city_id,
          channelId: post.channel_id,
        })
      }
    >
      {option.option_text}
    </button>
  );
}
