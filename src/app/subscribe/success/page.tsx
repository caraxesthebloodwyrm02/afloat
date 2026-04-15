'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function SubscribeSuccessContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );

  useEffect(() => {
    async function verify() {
      const sessionId = searchParams.get('session_id');
      if (!sessionId) {
        setStatus('error');
        return;
      }

      try {
        const res = await fetch('/api/v1/subscribe/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });

        if (!res.ok) {
          setStatus('error');
          return;
        }

        const data = await res.json();
        if (data.token) {
          localStorage.setItem('afloat_token', data.token);
        }
        setStatus('success');
      } catch {
        setStatus('error');
      }
    }

    verify();
  }, [searchParams]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <p className="text-sm text-zinc-400">Verifying your subscription...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-4">
        <p className="text-sm text-red-500">
          Something went wrong verifying your subscription.
        </p>
        <a
          href="/subscribe"
          className="text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          Try again
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6">
      <h1 className="text-2xl font-semibold text-zinc-900">You&apos;re in.</h1>
      <p className="text-sm text-zinc-500">
        Subscription active. Set your consent preferences to continue.
      </p>
      <a
        href="/consent"
        className="h-10 px-6 inline-flex items-center justify-center bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
      >
        Set consent preferences
      </a>
    </div>
  );
}

export default function SubscribeSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[80vh]">
          <p className="text-sm text-zinc-400">Loading...</p>
        </div>
      }
    >
      <SubscribeSuccessContent />
    </Suspense>
  );
}
