import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoginPage() {
  const { session, loading, signInWithEmail, verifyOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'verifying' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  if (!loading && session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('sending');
    const { error } = await signInWithEmail(email);
    if (error) {
      setErrorMessage(error);
      setStatus('error');
      return;
    }
    setStatus('idle');
    setSent(true);
  }

  async function handleVerifyCode(event: FormEvent) {
    event.preventDefault();
    setStatus('verifying');
    const { error } = await verifyOtp(email, code);
    if (error) {
      setErrorMessage(error);
      setStatus('error');
      return;
    }
    // On success the session updates via onAuthStateChange and this
    // component re-renders into the `session` redirect above.
  }

  // Reachable independent of whether sending an email succeeded — the code
  // may have come from somewhere other than a link freshly clicked in this
  // browser (a previous email, or one generated out-of-band), so requiring
  // a successful send first would make it useless exactly when the send
  // path is unavailable.
  if (showCodeEntry || sent) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-lg font-semibold">Enter your code</p>
        <p className="text-muted-foreground">
          {sent
            ? `We sent a login link to ${email}. Click that link, or enter the code from that email below.`
            : 'Enter the email and code from your login email.'}
        </p>
        <form onSubmit={handleVerifyCode} className="mt-2 flex w-full max-w-sm flex-col gap-3">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            placeholder="Code from your email"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <Button type="submit" disabled={status === 'verifying'}>
            {status === 'verifying' ? 'Verifying…' : 'Verify code'}
          </Button>
          {status === 'error' && <p className="text-sm text-destructive">{errorMessage}</p>}
        </form>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setShowCodeEntry(false);
            setSent(false);
            setStatus('idle');
            setErrorMessage('');
          }}
        >
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">PiMesh</h1>
      <p className="text-muted-foreground">Your Pi Community, Anywhere.</p>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send link'}
        </Button>
        {status === 'error' && <p className="text-sm text-destructive">{errorMessage}</p>}
      </form>
      <Button type="button" variant="outline" onClick={() => setShowCodeEntry(true)}>
        Already have a code?
      </Button>
    </div>
  );
}
