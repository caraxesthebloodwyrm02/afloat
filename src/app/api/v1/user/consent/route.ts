import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthenticated } from '@/lib/auth-middleware';
import { getUser, updateUser } from '@/lib/data-layer';
import { updateConsent } from '@/lib/consent';
import { auditAction } from '@/lib/audit';
import type { ApiError } from '@/types/api';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;

  const userRecord = await getUser(user.user_id);
  if (!userRecord) {
    return NextResponse.json<ApiError>(
      { error: 'not_found', message: 'User not found.' },
      { status: 404 }
    );
  }

  let body: {
    session_telemetry?: boolean;
    marketing_communications?: boolean;
    routing_memory?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiError>(
      { error: 'empty_input', message: 'Invalid request body.' },
      { status: 400 }
    );
  }

  const changes: string[] = [];

  if (typeof body.session_telemetry === 'boolean') {
    userRecord.consents.session_telemetry = updateConsent(
      userRecord.consents.session_telemetry,
      body.session_telemetry
    );
    changes.push('session_telemetry');
  }

  if (typeof body.marketing_communications === 'boolean') {
    userRecord.consents.marketing_communications = updateConsent(
      userRecord.consents.marketing_communications,
      body.marketing_communications
    );
    changes.push('marketing_communications');
  }

  if (typeof body.routing_memory === 'boolean') {
    userRecord.consents.routing_memory = updateConsent(
      userRecord.consents.routing_memory ?? {
        granted: false,
        timestamp: new Date().toISOString(),
        policy_version: 'v1.0',
      },
      body.routing_memory
    );
    changes.push('routing_memory');
  }

  if (changes.length === 0) {
    return NextResponse.json({ message: 'No changes.' });
  }

  await updateUser(userRecord);

  await auditAction(request, user, {
    action: 'consent_change',
    resource_type: 'consent_record',
    resource_id: user.user_id,
    outcome: 'success',
    metadata: { changed_fields: changes },
  });

  return NextResponse.json({
    message: 'Consent preferences updated.',
    updated: changes,
  });
}
