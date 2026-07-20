import { useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useCreatePost } from '../../hooks/useCreatePost';
import { getVideoDuration } from '../../lib/media';
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
  { value: 'video', label: 'Video' },
  { value: 'poll', label: 'Poll' },
  { value: 'question', label: 'Question' },
  { value: 'buy_sell', label: 'Buy & Sell' },
  { value: 'merchant_promo', label: 'Merchant promotion' },
  { value: 'announcement', label: 'Announcement' },
];

const CURRENCIES: { value: 'USD' | 'PHP' | 'PI'; label: string }[] = [
  { value: 'PHP', label: 'PHP' },
  { value: 'USD', label: 'USD' },
  { value: 'PI', label: 'PI' },
];

export function PostComposer({ cityId }: { cityId: string }) {
  const { session } = useAuth();
  const createPost = useCreatePost();
  const [postType, setPostType] = useState<PostType>('text');
  const [body, setBody] = useState('');
  const [mediaFile, setMediaFile] = useState<File | undefined>(undefined);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [priceAmount, setPriceAmount] = useState('');
  const [priceCurrency, setPriceCurrency] = useState<'USD' | 'PHP' | 'PI'>('PHP');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');

  function updatePollOption(index: number, value: string) {
    setPollOptions((options) => options.map((option, i) => (i === index ? value : option)));
  }

  function addPollOption() {
    setPollOptions((options) => (options.length < 4 ? [...options, ''] : options));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError('');

    if (postType === 'video' && mediaFile) {
      const duration = await getVideoDuration(mediaFile);
      if (duration > 60) {
        setError('Videos must be 60 seconds or shorter.');
        return;
      }
    }

    try {
      await createPost.mutateAsync({
        authorId: session.user.id,
        cityId,
        channelId: null,
        postType,
        body: body.trim() || null,
        mediaFile: postType === 'photo' || postType === 'video' ? mediaFile : undefined,
        mediaType:
          postType === 'video' ? 'video' : postType === 'photo' ? 'photo' : undefined,
        pollOptions: postType === 'poll' ? pollOptions.filter((option) => option.trim()) : undefined,
        buySell:
          postType === 'buy_sell'
            ? { priceAmount: Number(priceAmount), priceCurrency, category: category.trim() }
            : undefined,
      });
      setBody('');
      setMediaFile(undefined);
      setPollOptions(['', '']);
      setPriceAmount('');
      setCategory('');
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
      {(postType === 'photo' || postType === 'video') && (
        <label className="text-sm">
          {postType === 'photo' ? 'Photo' : 'Video'}
          <input
            type="file"
            accept={postType === 'photo' ? 'image/*' : 'video/*'}
            aria-label={postType === 'photo' ? 'Photo' : 'Video'}
            onChange={(event) => setMediaFile(event.target.files?.[0])}
          />
        </label>
      )}
      {postType === 'poll' && (
        <div className="flex flex-col gap-2">
          {pollOptions.map((option, index) => (
            <Input
              key={index}
              placeholder="Option"
              value={option}
              onChange={(event) => updatePollOption(index, event.target.value)}
            />
          ))}
          {pollOptions.length < 4 && (
            <Button type="button" variant="outline" size="sm" onClick={addPollOption}>
              Add option
            </Button>
          )}
        </div>
      )}
      {postType === 'buy_sell' && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              placeholder="Price"
              type="number"
              value={priceAmount}
              onChange={(event) => setPriceAmount(event.target.value)}
            />
            <Select value={priceCurrency} onValueChange={(value) => setPriceCurrency(value as 'USD' | 'PHP' | 'PI')}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((currency) => (
                  <SelectItem key={currency.value} value={currency.value}>
                    {currency.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            placeholder="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
      )}
      <Button type="submit" disabled={createPost.isPending}>
        {createPost.isPending ? 'Posting…' : 'Post'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
