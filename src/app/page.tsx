import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
      <div className="max-w-lg w-full text-center space-y-8">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Afloat
        </h1>
        <p className="text-lg text-zinc-500 dark:text-zinc-400 leading-relaxed">
          A no-fluff cognitive assistant.
          <br />
          Get past context gates in under 2 minutes.
        </p>

        <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-6 space-y-4 text-left">
          <h2 className="text-sm font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
            What it does
          </h2>
          <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
            <li className="flex gap-3">
              <span className="text-zinc-300 dark:text-zinc-600 mt-0.5">01</span>
              <span>You describe what you&apos;re stuck on</span>
            </li>
            <li className="flex gap-3">
              <span className="text-zinc-300 dark:text-zinc-600 mt-0.5">02</span>
              <span>It identifies the type of block</span>
            </li>
            <li className="flex gap-3">
              <span className="text-zinc-300 dark:text-zinc-600 mt-0.5">03</span>
              <span>
                You get a short, honest brief — just enough to unblock
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-zinc-300 dark:text-zinc-600 mt-0.5">04</span>
              <span>One optional follow-up, then you&apos;re on your way</span>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <a
            href="/subscribe"
            className="inline-flex items-center justify-center w-full h-12 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            Get Started — from $9/quarter
          </a>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Trial at $9/quarter or continuous at $3/hour. Cancel anytime.
          </p>
        </div>

        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-700 space-y-2">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Meeting triage &middot; Priority decisions &middot; Quick briefings
            &middot; Context gate resolution
          </p>
          <Link
            href="/case-study"
            className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 underline transition-colors"
          >
            How it&apos;s built — engineering case study
          </Link>
        </div>
      </div>
    </div>
  );
}
