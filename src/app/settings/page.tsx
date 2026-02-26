"use client";

import { useEffect, useState } from "react";

interface ConsentState {
  session_telemetry: boolean;
  marketing_communications: boolean;
}

export default function SettingsPage() {
  const [consents, setConsents] = useState<ConsentState | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("afloat_token");
    if (!token) {
      window.location.href = "/subscribe";
      return;
    }

    async function loadConsents() {
      try {
        const res = await fetch("/api/v1/user/data-export", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setConsents({
            session_telemetry:
              data.consent_records?.session_telemetry?.granted ?? false,
            marketing_communications:
              data.consent_records?.marketing_communications?.granted ?? false,
          });
        }
      } catch {
        setMessage("Failed to load settings.");
      }
    }

    loadConsents();
  }, []);

  async function handleToggle(field: keyof ConsentState, value: boolean) {
    const token = localStorage.getItem("afloat_token");
    if (!token) return;

    setConsents((prev) => (prev ? { ...prev, [field]: value } : null));
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/v1/user/consent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [field]: value }),
      });

      if (res.ok) {
        setMessage("Saved.");
      } else {
        setMessage("Failed to save.");
        setConsents((prev) => (prev ? { ...prev, [field]: !value } : null));
      }
    } catch {
      setMessage("Network error.");
      setConsents((prev) => (prev ? { ...prev, [field]: !value } : null));
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 2000);
    }
  }

  async function handleDeleteAccount() {
    const token = localStorage.getItem("afloat_token");
    if (!token) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete your account? You have a 7-day grace period to cancel.",
    );
    if (!confirmed) return;

    try {
      const res = await fetch("/api/v1/user/data", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessage(data.message || "Deletion requested.");
      }
    } catch {
      setMessage("Failed to request deletion.");
    }
  }

  async function handleExportData() {
    const token = localStorage.getItem("afloat_token");
    if (!token) return;

    try {
      const res = await fetch("/api/v1/user/data-export?format=portable", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
        const filename = filenameMatch?.[1] ?? "afloat-data-export.zip";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      setMessage("Failed to export data.");
    }
  }

  if (!consents) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <p className="text-sm text-zinc-400">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-[80vh] px-6 py-12">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Settings</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage your consent preferences and data.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
            Consent
          </h2>

          <label className="flex items-center justify-between p-4 rounded-lg bg-zinc-50">
            <div>
              <p className="text-sm font-medium text-zinc-700">
                Session telemetry
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Performance metrics, no personal text
              </p>
            </div>
            <input
              type="checkbox"
              checked={consents.session_telemetry}
              onChange={(e) =>
                handleToggle("session_telemetry", e.target.checked)
              }
              disabled={saving}
              className="h-4 w-4"
            />
          </label>

          <label className="flex items-center justify-between p-4 rounded-lg bg-zinc-50">
            <div>
              <p className="text-sm font-medium text-zinc-700">
                Marketing communications
              </p>
              <p className="text-xs text-zinc-400 mt-1">Feature updates</p>
            </div>
            <input
              type="checkbox"
              checked={consents.marketing_communications}
              onChange={(e) =>
                handleToggle("marketing_communications", e.target.checked)
              }
              disabled={saving}
              className="h-4 w-4"
            />
          </label>
        </div>

        {message && (
          <p className="text-xs text-zinc-500 text-center">{message}</p>
        )}

        <div className="space-y-4 pt-4 border-t border-zinc-100">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
            Your Data
          </h2>

          <button
            onClick={handleExportData}
            className="w-full h-10 text-sm font-medium border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-zinc-600"
          >
            Export my data
          </button>

          <button
            onClick={handleDeleteAccount}
            className="w-full h-10 text-sm font-medium border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-red-600"
          >
            Delete my account
          </button>
        </div>

        <div className="pt-4">
          <a
            href="/chat"
            className="text-sm text-zinc-400 hover:text-zinc-600 underline"
          >
            Back to chat
          </a>
        </div>
      </div>
    </div>
  );
}
