import { useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useCreatePost } from '../../hooks/useCreatePost';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PostType } from '../../types/post';

const POST_TYPES: { value: PostType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'photo', label: 'Photo' },
  { value: 'question', label: 'Question' },
  { value: 'merchant_promo', label: 'Merchant promotion' },
  { value: 'announcement', label: 'Announcement' },
];

export function PostComposer({ cityId }: { cityId: string }) {
  const { session } = useAuth();
  const createPost = useCreatePost();
  const [postType, setPostType] = useState<PostType>('text');
  const [body, setBody] = useState('');
  const [mediaFile, setMediaFile] = useState<File | undefined>(undefined);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError('');

    try {
      await createPost.mutateAsync({
        authorId: session.user.id,
        cityId,
        channelId: null,
        postType,
        body: body.trim() || null,
        mediaFile: postType === 'photo' ? mediaFile : undefined,
      });
      setBody('');
      setMediaFile(undefined);
    } catch {
      setError("Couldn't create your post. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-2 rounded-lg border p-4">
      <Select value={postType} onValueChange={(value) => setPostType(value as PostType)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {POST_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder="What's happening?"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      {postType === 'photo' && (
        <label className="text-sm">
          Photo
          <input
            type="file"
            accept="image/*"
            aria-label="Photo"
            onChange={(event) => setMediaFile(event.target.files?.[0])}
          />
        </label>
      )}
      <Button type="submit" disabled={createPost.isPending}>
        {createPost.isPending ? 'Posting…' : 'Post'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
