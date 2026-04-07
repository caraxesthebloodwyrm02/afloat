import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthenticated } from '@/lib/auth-middleware';
import {
  emitEvent,
  type LifecycleEvent,
  type LifecycleEventType,
} from '@/lib/events';
import { v4 as uuidv4 } from 'uuid';

const CLIENT_EVENT_TYPES: LifecycleEventType[] = [
  'cta_clicked',
  'cta_dismissed',
  'console_warning_displayed',
];

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;

  let body: { event_type: string; metadata?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  if (
    !body.event_type ||
    !CLIENT_EVENT_TYPES.includes(body.event_type as LifecycleEventType)
  ) {
    return NextResponse.json(
      {
        error: 'bad_request',
        message: `Invalid event_type. Allowed: ${CLIENT_EVENT_TYPES.join(', ')}`,
      },
      { status: 400 }
    );
  }

  const event: LifecycleEvent = {
    event_id: uuidv4(),
    event_type: body.event_type as LifecycleEventType,
    user_id: user.user_id,
    timestamp: new Date().toISOString(),
    tier: 'unknown',
    metadata: body.metadata ?? {},
  };

  await emitEvent(event);

  return NextResponse.json({ received: true, event_id: event.event_id });
}
