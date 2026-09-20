import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST, GET, OPTIONS } from '../route';

describe('Solana RPC Proxy (/api/rpc)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SOLANA_RPC_URL = 'https://mock-rpc.solana.internal/?api_key=SECRET_123';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepts and forwards valid single JSON-RPC 2.0 requests', async () => {
    const mockUpstreamResponse = JSON.stringify({
      jsonrpc: '2.0',
      result: { value: 12345 },
      id: 1,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(mockUpstreamResponse, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const req = new Request('http://localhost:3000/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getHealth',
        params: [],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({
      jsonrpc: '2.0',
      result: { value: 12345 },
      id: 1,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://mock-rpc.solana.internal/?api_key=SECRET_123',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('accepts and forwards valid batch JSON-RPC requests', async () => {
    const mockUpstreamResponse = JSON.stringify([
      { jsonrpc: '2.0', result: 'ok', id: 1 },
      { jsonrpc: '2.0', result: 'ok', id: 2 },
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(mockUpstreamResponse, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const req = new Request('http://localhost:3000/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'getHealth' },
        { jsonrpc: '2.0', id: 2, method: 'getVersion' },
      ]),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveLength(2);
  });

  it('rejects malformed JSON payloads with 400 and parse error code', async () => {
    const req = new Request('http://localhost:3000/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"invalid_json_missing_brace',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe(-32700);
    expect(data.error.message).toContain('Parse error');
  });

  it('rejects invalid non-JSON-RPC payloads with 400', async () => {
    const req = new Request('http://localhost:3000/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notJsonRpc: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error.code).toBe(-32600);
    expect(data.error.message).toContain('Invalid Request');
  });

  it('rejects payloads exceeding 512KB limit with 413 Payload Too Large', async () => {
    const largeString = 'a'.repeat(600 * 1024);
    const req = new Request('http://localhost:3000/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'testLarge',
        params: [largeString],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(413);

    const data = await res.json();
    expect(data.error.message).toContain('Payload Too Large');
  });

  it('preserves upstream error status codes without fabricating fallback data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const req = new Request('http://localhost:3000/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getHealth',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('handles upstream connection failure cleanly and never exposes secret API keys', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('Connection to https://mock-rpc.solana.internal/?api_key=SECRET_123 failed')
    );

    const req = new Request('http://localhost:3000/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 42,
        method: 'getAccountInfo',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);

    const data = await res.json();
    expect(data.error.code).toBe(-32603);
    // Crucial: Ensure secret key is never leaked
    expect(JSON.stringify(data)).not.toContain('SECRET_123');
    expect(JSON.stringify(data)).not.toContain('mock-rpc');
  });

  it('returns 405 Method Not Allowed on GET requests', async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST, OPTIONS');
  });

  it('returns 204 No Content on OPTIONS preflight requests', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Allow')).toContain('POST');
  });
});
