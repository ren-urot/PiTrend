import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoginPage() {
  const { session, loading, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
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
    setStatus('sent');
  }

  if (status === 'sent') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-lg font-semibold">Check your email</p>
        <p className="text-muted-foreground">We sent a login link to {email}.</p>
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
    </div>
  );
}
