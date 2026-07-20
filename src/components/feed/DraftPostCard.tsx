import { retryDraft } from '../../lib/offlineQueue';
import { Button } from '@/components/ui/button';
import type { DraftPost } from '../../lib/db';

export function DraftPostCard({ draft }: { draft: DraftPost }) {
  return (
    <div className="rounded-lg border border-dashed p-4">
      {draft.body && <p className="mb-2 whitespace-pre-wrap">{draft.body}</p>}
      {draft.status === 'queued' && <p className="text-sm text-muted-foreground">Waiting to send…</p>}
      {draft.status === 'syncing' && <p className="text-sm text-muted-foreground">Sending…</p>}
      {draft.status === 'failed' && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-destructive">Couldn't send: {draft.lastError}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => retryDraft(draft.id)}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
