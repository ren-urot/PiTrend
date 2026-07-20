import { useState, type FormEvent } from 'react';
import { Type, Image, Video, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { queueDraftPost, processQueue } from '../../lib/offlineQueue';
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import type { PostType } from '../../types/post';

const QUICK_POST_TYPES: { value: PostType; label: string; icon: typeof Type }[] = [
  { value: 'text', label: 'Text', icon: Type },
  { value: 'photo', label: 'Photo', icon: Image },
  { value: 'video', label: 'Video', icon: Video },
];

const MORE_POST_TYPES: { value: PostType; label: string }[] = [
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

export function PostComposer({
  cityId,
  channelId = null,
}: {
  cityId: string;
  channelId?: string | null;
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [postType, setPostType] = useState<PostType>('text');
  const [body, setBody] = useState('');
  const [mediaFile, setMediaFile] = useState<File | undefined>(undefined);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [priceAmount, setPriceAmount] = useState('');
  const [priceCurrency, setPriceCurrency] = useState<'USD' | 'PHP' | 'PI'>('PHP');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isMoreTypeSelected = MORE_POST_TYPES.some((type) => type.value === postType);
  const selectedMoreLabel = MORE_POST_TYPES.find((type) => type.value === postType)?.label;

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

    setSubmitting(true);

    try {
      await queueDraftPost({
        authorId: session.user.id,
        cityId,
        channelId,
        postType,
        body: body.trim() || null,
        mediaBlob:
          (postType === 'photo' || postType === 'video') && mediaFile
            ? { blob: mediaFile, mediaType: postType === 'video' ? 'video' : 'photo' }
            : undefined,
        pollOptions: postType === 'poll' ? pollOptions.filter((option) => option.trim()) : undefined,
        buySell:
          postType === 'buy_sell'
            ? { priceAmount: Number(priceAmount), priceCurrency, category: category.trim() }
            : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ['drafts', session.user.id] });
      setBody('');
      setMediaFile(undefined);
      setPollOptions(['', '']);
      setPriceAmount('');
      setCategory('');

      processQueue().then(() => {
        queryClient.invalidateQueries({ queryKey: ['posts'] });
        queryClient.invalidateQueries({ queryKey: ['drafts'] });
      });
    } catch {
      setError("Couldn't save your post. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        {QUICK_POST_TYPES.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            type="button"
            variant={postType === value ? 'default' : 'outline'}
            size="icon"
            aria-label={`${label} post`}
            onClick={() => setPostType(value)}
          >
            <Icon size={18} />
          </Button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={isMoreTypeSelected ? 'default' : 'outline'}
              size="icon"
              aria-label="More post types"
            >
              <MoreHorizontal size={18} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {MORE_POST_TYPES.map((type) => (
              <DropdownMenuItem key={type.value} onSelect={() => setPostType(type.value)}>
                {type.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {isMoreTypeSelected && (
          <span className="text-sm font-medium text-muted-foreground">{selectedMoreLabel}</span>
        )}
      </div>
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
            <Select
              value={priceCurrency}
              onValueChange={(value) => setPriceCurrency(value as 'USD' | 'PHP' | 'PI')}
            >
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
      <Button type="submit" disabled={submitting} className="rounded-full">
        {submitting ? 'Saving…' : 'Post'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
