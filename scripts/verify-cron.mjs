#!/usr/bin/env node
/**
 * Verify cron endpoint responds correctly.
 * Run on first user: CRON_SECRET=xxx node scripts/verify-cron.mjs
 * Optional: NEXT_PUBLIC_APP_URL (defaults to production)
 */
const secret = process.env.CRON_SECRET;
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://afloat-six.vercel.app";

if (!secret) {
  console.error("Missing CRON_SECRET in environment");
  process.exit(1);
}

const url = `${baseUrl.replace(/\/$/, "")}/api/cron/cleanup`;

try {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const data = await res.json();

  if (res.ok && data.ok === true) {
    console.log("Cron verification OK:", JSON.stringify(data, null, 2));
    process.exit(0);
  } else {
    console.error("Cron verification failed:", res.status, data);
    process.exit(1);
  }
} catch (err) {
  console.error("Cron request failed:", err.message);
  process.exit(1);
}
