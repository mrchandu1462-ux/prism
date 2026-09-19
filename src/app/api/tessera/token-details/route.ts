import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const upstreamUrl =
      process.env.NEXT_PUBLIC_TESSERA_API_URL || 'https://rest-api.tessera.pe/v1/public/token-details';

    const response = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return NextResponse.json(
        { error: `Tessera upstream returned HTTP ${response.status}: ${errorText.slice(0, 200)}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch Tessera token details' },
      { status: 500 }
    );
  }
}
