import { useState, type FormEvent } from 'react';
import { useCities } from '../../hooks/useCities';
import { useCreateListing } from '../../hooks/useCreateListing';
import { MARKETPLACE_CATEGORY_LABELS } from '../../lib/marketplaceDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MarketplaceCategory } from '../../types/marketplace';

const CATEGORY_OPTIONS = Object.entries(MARKETPLACE_CATEGORY_LABELS) as [MarketplaceCategory, string][];

const CURRENCIES: { value: 'USD' | 'PHP' | 'PI'; label: string }[] = [
  { value: 'PHP', label: 'PHP' },
  { value: 'USD', label: 'USD' },
  { value: 'PI', label: 'PI' },
];

interface CreateListingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId: string;
  defaultCityId: string;
}

export function CreateListingDialog({
  open,
  onOpenChange,
  sellerId,
  defaultCityId,
}: CreateListingDialogProps) {
  const { data: cities } = useCities();
  const createListing = useCreateListing();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [priceCurrency, setPriceCurrency] = useState<'USD' | 'PHP' | 'PI'>('PHP');
  const [category, setCategory] = useState<MarketplaceCategory>('other');
  const [cityId, setCityId] = useState(defaultCityId);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [error, setError] = useState('');

  function resetForm() {
    setTitle('');
    setDescription('');
    setPriceAmount('');
    setPriceCurrency('PHP');
    setCategory('other');
    setCityId(defaultCityId);
    setPhotoFiles([]);
    setError('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    try {
      await createListing.mutateAsync({
        sellerId,
        cityId,
        category,
        title: title.trim(),
        description: description.trim() || null,
        priceAmount: Number(priceAmount),
        priceCurrency,
        photoFiles,
      });
      resetForm();
      onOpenChange(false);
    } catch {
      setError("Couldn't create your listing. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sell something</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <div className="flex gap-2">
            <Input
              placeholder="Price"
              type="number"
              value={priceAmount}
              onChange={(event) => setPriceAmount(event.target.value)}
              required
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
          <Select value={category} onValueChange={(value) => setCategory(value as MarketplaceCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={cityId} onValueChange={setCityId}>
            <SelectTrigger>
              <SelectValue placeholder="City" />
            </SelectTrigger>
            <SelectContent>
              {cities?.map((city) => (
                <SelectItem key={city.id} value={city.id}>
                  {city.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="text-sm">
            Photos
            <input
              type="file"
              accept="image/*"
              multiple
              aria-label="Photos"
              onChange={(event) => setPhotoFiles(Array.from(event.target.files ?? []))}
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={createListing.isPending}>
              {createListing.isPending ? 'Posting…' : 'Post listing'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
