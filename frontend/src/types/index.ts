export interface App {
  id: string;
  name: string;
  team: string;
  env: string;
  status: 'enable' | 'disable';
  mode: 'soft' | 'monitor' | 'guard' | 'bypass';
  model?: string;
  owner?: string | null;
  ownerEmail?: string | null;
  ownerId?: string | null;
  orgId?: string | null;
  blocked: number;
  total: number;
  rps?: number;
  lat?: number;
  p95?: number;
  sla?: number;
  primaryProviderId?: string | null;
  backup1ProviderId?: string | null;
  backup2ProviderId?: string | null;
  maxTokens?: number | null;
  maxPayloadSize?: number | null;
  enableT2?: boolean;
  enableKnowledgeDev?: boolean;
  enableResponseCache?: boolean;
  cacheTtlSeconds?: number | null;
  multiTurnSemanticEnabled?: boolean;
  enableContentQualityScan?: boolean;
  contentQualityScanMode?: string | null;
  contentQualityScanThreshold?: number | null;
  quotaMode?: 'unlimited' | 'fixed' | 'monthly';
  quotaLimit?: number | null;
  quotaWarningLimit?: number | null;
  quotaEnforcement?: 'hard' | 'soft';
  quotaResetDay?: number | null;
  quotaUsed?: number;
  quotaState?: 'ok' | 'warning' | 'exceeded';
}

export interface AppQuotaUsage {
  config: {
    mode: 'unlimited' | 'fixed' | 'monthly';
    limit: number | null;
    warning: number | null;
    enforcement: 'hard' | 'soft';
    reset_day: number | null;
  };
  usage: {
    used: number;
    period_start: string | null;
    period_end: string | null;
    percent: number;
    state: 'ok' | 'warning' | 'exceeded';
  };
}

interface ThreatTemplate {
  framework_id: string;
  sev: 'crit' | 'high' | 'med' | 'low';
  title: string;
  action: string;
  excerpt: string;
  detector: string;
  confidence: number;
}

export interface ThreatEvent {
  id: string;
  ts: number;
  age: number;
  framework_id: string;
  sev: 'crit' | 'high' | 'med' | 'low';
  title: string;
  action: string;
  excerpt: string;
  detector: string;
  confidence: number;
  app: string;
  appName: string;
  src: string;
  appApiKey: string;
  requestId: string;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  user?: string;
  isClassificationCorrect: boolean | null;
  correctionReason: string | null;
  classificationReason: string | null;
  inboundPrompt: string | null;
  blockedStage?: string | null;
  t2Flagged?: boolean | null;
  t2Reason?: string | null;
}

export interface TrafficRow {
  id: string;
  ts: number;
  method: string;
  path: string;
  app: string;
  appName: string;
  model: string;
  src: string;
  appApiKey: string | null;
  ms: number;
  tokensIn: number;
  tokensOut: number;
  code: number;
  flag: boolean;
  action: string | null;
  userAgent: string | null;
  threatTitle: string | null;
  threat: ThreatTemplate | null;
  userPrompt: string | null;
  responseBody: string | null;
  framework_id: string | null;
  confidence: number | null;
  detector: string | null;
  upstreamProviderId: string | null;
  upstreamProviderName: string | null;
  classifierProviderId: string | null;
  classifierProviderName: string | null;
  isClassificationCorrect: boolean | null;
  correctionReason: string | null;
  classificationReason: string | null;
  threatKnowledgeMatches: { id: string; name: string; similarity: number }[] | null;
  semanticThreshold: number | null;            // threshold used for embedding search
  falsePositiveCandidate: boolean;              // semantic matched but classifier said safe
  pipelineTrace: PipelineTrace | null;          // per-request stage timeline
  finalDecision: string | null;                 // SAFE / ATTACK
  blockedStage: string | null;                  // e.g. 'acl', 'keyword_regex', 'semantic_llm', 't2_intent', 'output_scan'
  t2Flagged: boolean | null;
  t2Confidence: number | null;
  t2Reason: string | null;
  gatewayInstanceId: string | null;
  gatewayName: string | null;
  rawInputPayload: string | null;
  rawOutputPayload: string | null;
  cacheHit: boolean;
  cacheTier: string | null;                     // 'l1' | 'l2_exact' | 'l2_semantic' | 'l2_multi_turn_semantic'
  contentQualityScanned: boolean;
  contentQualityGroundedness: number | null;
  contentQualityRelevance: number | null;
  contentQualityHallucination: number | null;
  contentQualityFlagged: boolean;
  contentQualityAction: string | null;           // 'blocked' | 'redacted' | 'flagged' | 'monitored' | null
  contentQualityReason: string | null;
}

export interface PipelineTrace {
  final_decision?: string;
  blocked_stage?: string;
  stages: PipelineStage[];
}

export interface PipelineStage {
  stage: string;
  decision: string;
  ms?: number;
  enforced?: boolean;
  would_block?: boolean;
  matched?: unknown[];
  matches?: { id: string; name: string; similarity: number }[];
  threshold?: number;
  provider?: string;
  category?: string;
  reason?: string;
}

export interface TweakValues {
  theme: 'light' | 'dark';
  density: 'compact' | 'default' | 'comfortable';
  accent: string;
  overviewLayout: 'default' | 'rail';
  tickerFlow: boolean;
}

export interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  framework_id: string | null;
  description: string | null;
  source_request_id: string | null;
  affected_app_id: string | null;
  affected_app_name: string | null;
  source_ip: string | null;
  detector: string | null;
  confidence: number | null;
  created_by: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  count?: number | string | null;
  live?: boolean;
  crit?: boolean;
  requiresAdminOrViewer?: boolean;
  requiresAdmin?: boolean;
}

export interface NavSection {
  group: string;
  items: NavItem[];
  requiresAdmin?: boolean;
}

export interface AppThreatKnowledgeItem {
  id: string;
  name: string;
  description: string;
  threat_context: string | null;
  status: string;
  source: string;
  enabled: boolean;
}

export interface AppDetectorItem {
  id: string;
  name: string;
  description: string;
  threshold: number;
  rule_type: string;
  scanning_scope: string;
  mode: string;
  keywords: string[] | null;
  redaction_placeholder: string | null;
  enabled: boolean;
}

export interface ToolGuardrailItem {
  id: string;
  tool_name: string;
  description: string | null;
  parameters_schema: object | null;
  active: boolean;
  quality_review_result?: string | null;
  quality_review_reason?: string | null;
  quality_reviewed_at?: string | null;
  quality_reviewed_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AppToolGuardrailItem {
  id: string;
  tool_name: string;
  description: string | null;
  blocked: boolean;
}

export interface ProviderMeterConfig {
  meter_mode: 'unlimited' | 'monthly';
  meter_metric: 'requests' | 'tokens' | 'cost';
  meter_limit: number | null;
  meter_warning_limit: number | null;
  meter_enforcement: 'hard' | 'soft';
  meter_reset_day: number | null;
  price_per_1m_input: number | null;
  price_per_1m_output: number | null;
}

export interface ProviderMeterSummaryItem {
  id: string;
  name: string;
  vendor: string;
  config: {
    mode: 'unlimited' | 'monthly';
    metric: 'requests' | 'tokens' | 'cost';
    limit: number | null;
    warning: number | null;
    enforcement: 'hard' | 'soft';
    reset_day: number | null;
    price_per_1m_input: number | null;
    price_per_1m_output: number | null;
  };
  usage: {
    requests: number;
    errors: number;
    tokens_in: number;
    tokens_out: number;
    est_cost: number;
    used: number;
    percent: number;
    state: 'ok' | 'warning' | 'exceeded';
    period_start: string | null;
    period_end: string | null;
  };
}
