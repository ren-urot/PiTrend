import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { Button } from '@/components/ui/button';
import piTrendSquareLogo from '../assets/pi-trend-square-logo.svg';

const REPROMPT_INTERVAL_MS = 60 * 1000;

export function InstallPwaBanner() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!canInstall) return;
    setDismissed(false);

    const interval = setInterval(() => setDismissed(false), REPROMPT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [canInstall]);

  if (!canInstall || dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-30 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border bg-card p-3 shadow-lg md:bottom-4 md:left-56 md:right-4 md:mx-0">
      <img src={piTrendSquareLogo} alt="Pi Trend" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">Install Pi Trend</p>
        <p className="truncate text-xs text-muted-foreground">Add it to your home screen for quick access.</p>
      </div>
      <Button type="button" size="sm" className="shrink-0" onClick={promptInstall}>
        Install
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        className="shrink-0 text-muted-foreground"
        onClick={() => setDismissed(true)}
      >
        <X size={18} />
      </button>
    </div>
  );
}
