import { NextRequest, NextResponse } from 'next/server';
import { setParam, getParamsVersion } from '@/lib/param-store';

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'not_available', message: 'Admin interface not configured.' },
      { status: 501 }
    );
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid admin credentials.' },
      { status: 401 }
    );
  }

  let body: { key: string; value: unknown; reason: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  if (!body.key || body.value === undefined || !body.reason) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Required: key, value, reason.' },
      { status: 400 }
    );
  }

  await setParam(body.key, body.value, body.reason);
  const version = await getParamsVersion();

  return NextResponse.json({
    updated: true,
    key: body.key,
    params_version: version,
  });
}
