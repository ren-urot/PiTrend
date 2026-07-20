import { describe, it, expect, vi, afterEach } from 'vitest';
import { getVideoDuration } from './media';

describe('getVideoDuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves with the duration once the video metadata loads', async () => {
    const fakeVideo: any = { preload: '', src: '', duration: 12.5 };
    vi.spyOn(document, 'createElement').mockReturnValue(fakeVideo);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const file = new File(['fake-video-bytes'], 'clip.mp4', { type: 'video/mp4' });
    const promise = getVideoDuration(file);

    fakeVideo.onloadedmetadata();

    await expect(promise).resolves.toBe(12.5);
  });

  it('rejects if the video metadata fails to load', async () => {
    const fakeVideo: any = { preload: '', src: '' };
    vi.spyOn(document, 'createElement').mockReturnValue(fakeVideo);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const file = new File(['not-a-video'], 'broken.mp4', { type: 'video/mp4' });
    const promise = getVideoDuration(file);

    fakeVideo.onerror();

    await expect(promise).rejects.toThrow('Could not read video metadata');
  });
});
