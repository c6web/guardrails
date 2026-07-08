import { http, HttpResponse } from 'msw';

export const mockHealth = {
  status: 'healthy',
  timestamp: '2025-01-01T00:00:00Z',
  data_db: true,
  log_db: true,
  cache_loaded_at: '2025-01-01T00:00:00Z',
  cache_next_reload_at: '2025-01-01T01:00:00Z',
  cache_next_reload_in: '3600s',
  detection_degraded: false,
};

export const mockUnhealthy = {
  ...mockHealth,
  status: 'unhealthy',
  data_db: false,
  detection_degraded: true,
};

export const mockScanAllow = {
  object: 'firewall.scan',
  request_id: 'req_allow_001',
  verdict: 'allow',
  final_decision: 'allow',
  blocked_stage: null,
  detector: null,
  framework_id: null,
  confidence: null,
  reason: 'No threats detected',
  semantic_matches: [],
  trace: null,
  duration_ms: 10,
};

export const mockScanBlock = {
  object: 'firewall.scan',
  request_id: 'req_block_001',
  verdict: 'block',
  final_decision: 'block',
  blocked_stage: 'input_scanner',
  detector: 'test_detector',
  framework_id: 'fw_001',
  confidence: 0.95,
  reason: 'Threat detected',
  semantic_matches: [{ id: 'tm_001', name: 'test_threat', similarity: 0.95 }],
  trace: {
    stages: [{ name: 'input_scanner', result: 'block', duration_ms: 5, details: {} }],
    final_decision: 'block',
  },
  duration_ms: 10,
};

export const mockCqScan = {
  object: 'firewall.cq_scan',
  request_id: 'req_cq_001',
  groundedness: [0.85],
  relevance: [0.9],
  hallucination: [0.15],
  verdict: 'allow',
  action: 'none',
  reason: 'Content quality ok',
  duration_ms: 20,
};

export const mockChatResponse = {
  id: 'chatcmpl_123',
  object: 'chat.completion',
  created: 1700000000,
  model: 'gpt-4',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Hi there!' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

export const mockEmbedding = {
  object: 'list',
  data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3] }],
  model: 'text-embedding-3-small',
  usage: { prompt_tokens: 2, total_tokens: 2 },
};

export const mockModeration = {
  id: 'mod_001',
  model: 'c6-guardrails-moderation',
  results: [
    {
      flagged: false,
      categories: {
        harassment: false,
        'harassment/threatening': false,
        hate: false,
        'hate/threatening': false,
        'self-harm': false,
        'self-harm/intent': false,
        'self-harm/instructions': false,
        sexual: false,
        'sexual/minors': false,
        violence: false,
        'violence/graphic': false,
      },
      category_scores: {
        harassment: 0.01,
        'harassment/threatening': 0.01,
        hate: 0.01,
        'hate/threatening': 0.01,
        'self-harm': 0.01,
        'self-harm/intent': 0.01,
        'self-harm/instructions': 0.01,
        sexual: 0.01,
        'sexual/minors': 0.01,
        violence: 0.01,
        'violence/graphic': 0.01,
      },
    },
  ],
};

let requestCount = 0;

export const handlers = [
  http.get('http://localhost:8082/health', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      return HttpResponse.json(mockUnhealthy, { status: 200 });
    }
    return HttpResponse.json(mockHealth, { status: 200 });
  }),

  http.post('http://localhost:8082/v1/scan', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (body?.__test_error__ === 'retry_until_success') {
      requestCount++;
      if (requestCount <= 1) {
        return new HttpResponse(null, { status: 502 });
      }
      return HttpResponse.json(mockScanAllow, { status: 200 });
    }

    if (body?.__test_error__ === 'retry_exhaust') {
      requestCount++;
      return new HttpResponse(null, { status: 502 });
    }

    return HttpResponse.json(mockScanAllow, { status: 200 });
  }),

  http.post('http://localhost:8082/v1/cq_scan', async ({ request }) => {
    return HttpResponse.json(mockCqScan, { status: 200 });
  }),

  http.post('http://localhost:8082/v1/chat/completions', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body?.stream === true) {
      const encoder = new TextEncoder();
      const chunks = [
        'data: ' + JSON.stringify({
          id: 'chatcmpl_123',
          object: 'chat.completion.chunk',
          created: 1700000000,
          model: 'gpt-4',
          choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
        }) + '\n\n',
        'data: ' + JSON.stringify({
          id: 'chatcmpl_123',
          object: 'chat.completion.chunk',
          created: 1700000000,
          model: 'gpt-4',
          choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
        }) + '\n\n',
        'data: ' + JSON.stringify({
          id: 'chatcmpl_123',
          object: 'chat.completion.chunk',
          created: 1700000000,
          model: 'gpt-4',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        }) + '\n\n',
        'data: [DONE]\n\n',
      ];
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });
      return new HttpResponse(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    return HttpResponse.json(mockChatResponse, { status: 200 });
  }),

  http.post('http://localhost:8082/v1/embeddings', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ...mockEmbedding,
      model: (body?.model as string) ?? mockEmbedding.model,
    }, { status: 200 });
  }),

  http.post('http://localhost:8082/v1/moderations', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const input = body?.input;
    const flagged = Array.isArray(input)
      ? input.map(() => ({ ...mockModeration.results[0], flagged: false }))
      : [{ ...mockModeration.results[0], flagged: true }];
    return HttpResponse.json({
      ...mockModeration,
      model: (body?.model as string) ?? mockModeration.model,
      results: Array.isArray(input)
        ? input.map(() => ({ ...mockModeration.results[0], flagged: false }))
        : flagged,
    }, { status: 200 });
  }),
];

export function resetRequestCount() {
  requestCount = 0;
}

export function getRequestCount() {
  return requestCount;
}
