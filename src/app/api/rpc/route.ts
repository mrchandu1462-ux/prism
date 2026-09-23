import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Maximum allowed payload size: 512 KB
const MAX_PAYLOAD_BYTES = 512 * 1024;
// Upstream RPC request timeout: 30 seconds
const UPSTREAM_TIMEOUT_MS = 30000;

/**
 * Validates whether an object adheres to standard JSON-RPC 2.0 structure.
 */
function isValidJsonRpcItem(item: any): boolean {
  return (
    typeof item === 'object' &&
    item !== null &&
    !Array.isArray(item) &&
    item.jsonrpc === '2.0' &&
    typeof item.method === 'string' &&
    item.method.length > 0
  );
}

/**
 * Validates single or batch JSON-RPC request payloads.
 */
function validateJsonRpcPayload(payload: any): boolean {
  if (Array.isArray(payload)) {
    return payload.length > 0 && payload.every(isValidJsonRpcItem);
  }
  return isValidJsonRpcItem(payload);
}

export async function POST(request: Request) {
  // 1. Request Size Check via Content-Length header
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader && parseInt(contentLengthHeader, 10) > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Payload Too Large: request body exceeds 512KB limit',
        },
        id: null,
      },
      { status: 413 }
    );
  }

  // 2. Read and enforce raw body size
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error: unable to read request body',
        },
        id: null,
      },
      { status: 400 }
    );
  }

  if (new TextEncoder().encode(rawBody).length > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Payload Too Large: request body exceeds 512KB limit',
        },
        id: null,
      },
      { status: 413 }
    );
  }

  // 3. Parse and validate JSON-RPC structure
  let parsedJson: any;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error: Invalid JSON payload',
        },
        id: null,
      },
      { status: 400 }
    );
  }

  if (!validateJsonRpcPayload(parsedJson)) {
    const id = Array.isArray(parsedJson) ? null : parsedJson?.id ?? null;
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request: Expected valid JSON-RPC 2.0 payload with "jsonrpc": "2.0" and "method"',
        },
        id,
      },
      { status: 400 }
    );
  }

  // 4. Resolve server-side upstream URL strictly from SOLANA_RPC_URL (no client-supplied destination allowed)
  const upstreamUrl =
    process.env.SOLANA_RPC_URL ||
    'https://api.mainnet-beta.solana.com';

  // 5. Forward request to upstream Solana RPC with timeout
  try {
    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: rawBody,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const responseText = await response.text();

    // Preserve exact upstream HTTP status & JSON-RPC response without modifying or mocking
    return new NextResponse(responseText, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (err: any) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    const status = isTimeout ? 504 : 502;
    const errorMessage = isTimeout
      ? 'Solana RPC upstream request timed out'
      : 'Failed to establish connection to upstream Solana RPC';

    const id = Array.isArray(parsedJson) ? null : parsedJson?.id ?? null;

    // Never leak upstream URL or secret API keys in the error response
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: errorMessage,
        },
        id,
      },
      { status }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Method Not Allowed: Solana RPC proxy only accepts POST requests',
      },
      id: null,
    },
    {
      status: 405,
      headers: {
        Allow: 'POST, OPTIONS',
      },
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'POST, OPTIONS',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
