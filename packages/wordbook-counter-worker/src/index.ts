export interface Env {
  DOWNLOAD_COUNTS: KVNamespace;
  API_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Secret',
  'Content-Type': 'application/json',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'POST' && url.pathname === '/increment') {
        return await handleIncrement(request, env);
      }

      if (request.method === 'GET' && url.pathname === '/counts') {
        return await handleGetCounts(url, env);
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        return json({ status: 'ok', timestamp: new Date().toISOString() });
      }

      return json({ error: 'Not Found' }, 404);
    } catch (e) {
      console.error('Worker error:', e);
      return json({ error: 'Internal Server Error' }, 500);
    }
  },
};

async function handleIncrement(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('X-API-Secret');
  if (!env.API_SECRET || secret !== env.API_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = await request.json<{ centerId: string; wordbookId: string }>();
  const { centerId, wordbookId } = body;

  if (!centerId || !wordbookId) {
    return json({ error: 'Missing centerId or wordbookId' }, 400);
  }

  const key = `${centerId}:${wordbookId}`;
  const current = parseInt((await env.DOWNLOAD_COUNTS.get(key)) || '0');
  const newCount = current + 1;

  await env.DOWNLOAD_COUNTS.put(key, String(newCount));

  return json({ success: true, count: newCount });
}

async function handleGetCounts(url: URL, env: Env): Promise<Response> {
  const centerId = url.searchParams.get('centerId');
  const idsParam = url.searchParams.get('ids');

  if (!centerId || !idsParam) {
    return json({ error: 'Missing centerId or ids' }, 400);
  }

  const ids = idsParam.split(',').filter(Boolean);
  const counts: Record<string, number> = {};

  await Promise.all(
    ids.map(async (id) => {
      const key = `${centerId}:${id}`;
      const value = await env.DOWNLOAD_COUNTS.get(key);
      counts[id] = parseInt(value || '0');
    }),
  );

  return json({ success: true, counts });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });
}
