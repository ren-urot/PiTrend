import { retryDraftMessage } from '../../lib/messageQueue';
import { Button } from '@/components/ui/button';
import type { DraftMessage } from '../../lib/db';

export function DraftMessageBubble({ draft }: { draft: DraftMessage }) {
  return (
    <div className="flex flex-col items-end gap-1 self-end">
      <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground opacity-80">
        {draft.body && <p className="whitespace-pre-wrap">{draft.body}</p>}
      </div>
      {(draft.status === 'queued' || draft.status === 'syncing') && (
        <p className="text-xs text-muted-foreground">Sending…</p>
      )}
      {draft.status === 'failed' && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-destructive">Couldn't send: {draft.lastError}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => retryDraftMessage(draft.id)}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
