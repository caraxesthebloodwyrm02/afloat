import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, type JWTPayload } from './auth';
import { isAllowedCaller } from './access';
import type { ApiError } from '@/types/api';

export async function authenticateRequest(
  request: NextRequest
): Promise<{ user: JWTPayload } | NextResponse<ApiError>> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'unauthorized' as const, message: 'Authentication required.' },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);

  if (!payload) {
    return NextResponse.json(
      { error: 'unauthorized' as const, message: 'Invalid or expired token.' },
      { status: 401 }
    );
  }

  return { user: payload };
}

/**
 * Authenticate via JWT and enforce ALLOWED_CALLERS allowlist when set.
 * Use this on all protected routes so allowlist is enforced in one place.
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ user: JWTPayload } | NextResponse<ApiError>> {
  const authResult = await authenticateRequest(request);
  if (!isAuthenticated(authResult)) return authResult;
  const { user } = authResult;
  if (!isAllowedCaller(user.user_id)) {
    return NextResponse.json(
      { error: 'forbidden' as const, message: 'Caller not in allowlist.' },
      { status: 403 }
    );
  }
  return { user };
}

export function isAuthenticated(
  result: { user: JWTPayload } | NextResponse<ApiError>
): result is { user: JWTPayload } {
  return 'user' in result;
}
