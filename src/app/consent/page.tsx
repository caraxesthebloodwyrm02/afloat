'use client';

import { useState } from 'react';

export default function ConsentPage() {
  const [telemetry, setTelemetry] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const token = localStorage.getItem('afloat_token');
    if (!token) {
      window.location.href = '/subscribe';
      return;
    }

    try {
      await fetch('/api/v1/user/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_telemetry: telemetry,
          marketing_communications: marketing,
        }),
      });
      window.location.href = '/chat';
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-900">
            Consent Preferences
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Choose how your data is used. You can change these anytime in
            Settings.
          </p>
        </div>

        <div className="space-y-4">
          <label className="flex items-start gap-3 p-4 rounded-lg bg-zinc-50">
            <input
              type="checkbox"
              checked={true}
              disabled={true}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-zinc-700">
                Essential processing
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Required for the service to work. Cannot be disabled.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-4 rounded-lg bg-zinc-50 cursor-pointer">
            <input
              type="checkbox"
              checked={telemetry}
              onChange={(e) => setTelemetry(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-zinc-700">
                Session telemetry
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Helps us improve response quality and measure performance. No
                personal text is stored.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-4 rounded-lg bg-zinc-50 cursor-pointer">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-zinc-700">
                Marketing communications
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Occasional updates about new features. No spam.
              </p>
            </div>
          </label>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-12 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save and start using Afloat'}
        </button>
      </div>
    </div>
  );
}
