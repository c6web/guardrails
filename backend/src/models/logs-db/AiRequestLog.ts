import type { Optional, Sequelize } from 'sequelize';
import { Model, DataTypes } from 'sequelize'

interface AiRequestLogAttributes {
  id: string
  request_id: string
  app_id: string
  app_name: string
  model: string
  method: string
  path: string
  source_ip: string
  app_api_key: string
  tokens_in: number
  tokens_out: number
  duration_ms: number
  status_code: number
  flagged: boolean
  is_classification_correct: boolean | null
  correction_reason: string | null
  framework_id: string | null
  detector: string | null
  confidence: number | null
  action: string | null
  threat_title: string | null
  excerpt: string | null
  user_prompt: string | null
  response_body: string | null
  upstream_provider_id: string | null
  upstream_provider_name: string | null
  classifier_provider_id: string | null
  classifier_provider_name: string | null
  is_benign: boolean
  marked_by: string | null
  reason: string | null
  marked_at: Date | null
  output_scan_flagged: boolean | null
  output_scan_framework_id: string | null
  output_scan_confidence: number | null
  output_scan_detector: string | null
  threat_knowledge_matches: unknown | null // JSONB array of {id, name, similarity}
  semantic_threshold: number | null         // threshold used for embedding search
  false_positive_candidate: boolean          // semantic matched but classifier said safe
  pipeline_trace: unknown | null             // JSONB array of {stage, action, details}
  final_decision: string | null              // SAFE / ATTACK
  blocked_stage: string | null               // e.g. 'acl', 'keyword', 'semantic', 'llm', 'output_scan', 't2_intent'
  classification_reason: string | null       // LLM classifier's textual explanation
  t2_flagged: boolean | null                 // T2 intent analysis flagged the prompt
  t2_confidence: number | null               // T2 classifier confidence score
  t2_reason: string | null                   // T2 classifier reason text
  request_mutations: string | null           // JSON array of MutationEntry: [{field,reason,before,after}]
  user_agent: string | null                  // User-Agent header from the request
  gateway_instance_id: string | null         // gateway instance that processed this request
  raw_input_payload: string | null           // raw client request body JSON (encrypted at rest)
  raw_output_payload: string | null          // raw upstream response body JSON (encrypted at rest)
  cache_hit: boolean | null                  // request was served from the response cache
  cache_tier: string | null                  // 'l1' | 'l2_exact' | 'l2_semantic' | 'l2_multi_turn_semantic'
  content_quality_scanned: boolean | null        // content quality scan ran for this request
  content_quality_groundedness: number | null    // TruLens-style groundedness score
  content_quality_relevance: number | null       // TruLens-style answer relevance score
  content_quality_hallucination: number | null   // derived hallucination score (1 - groundedness)
  content_quality_flagged: boolean | null        // scan result crossed the app's threshold
  content_quality_action: string | null          // 'blocked' | 'redacted' | 'flagged' | 'monitored' | null
  content_quality_reason: string | null          // judge's textual explanation
  created_at?: Date
}

type AiRequestLogCreationAttributes = Optional<
  AiRequestLogAttributes,
  | 'id'
  | 'flagged'
  | 'is_classification_correct'
  | 'correction_reason'
  | 'framework_id'
  | 'detector'
  | 'confidence'
  | 'action'
  | 'threat_title'
  | 'excerpt'
  | 'user_prompt'
  | 'response_body'
  | 'upstream_provider_id'
  | 'upstream_provider_name'
  | 'classifier_provider_id'
  | 'classifier_provider_name'
  | 'is_benign'
  | 'marked_by'
  | 'reason'
  | 'marked_at'
  | 'output_scan_flagged'
  | 'output_scan_framework_id'
  | 'output_scan_confidence'
  | 'output_scan_detector'
  | 'threat_knowledge_matches'
  | 'semantic_threshold'
  | 'false_positive_candidate'
  | 'pipeline_trace'
  | 'final_decision'
  | 'blocked_stage'
  | 'classification_reason'
  | 't2_flagged'
  | 't2_confidence'
  | 't2_reason'
  | 'request_mutations'
  | 'user_agent'
  | 'gateway_instance_id'
  | 'raw_input_payload'
  | 'raw_output_payload'
  | 'cache_hit'
  | 'cache_tier'
  | 'content_quality_scanned'
  | 'content_quality_groundedness'
  | 'content_quality_relevance'
  | 'content_quality_hallucination'
  | 'content_quality_flagged'
  | 'content_quality_action'
  | 'content_quality_reason'
>

export class AiRequestLog
  extends Model<AiRequestLogAttributes, AiRequestLogCreationAttributes>
  implements AiRequestLogAttributes
{
  declare id: string
  declare request_id: string
  declare app_id: string
  declare app_name: string
  declare model: string
  declare method: string
  declare path: string
  declare source_ip: string
  declare app_api_key: string
  declare tokens_in: number
  declare tokens_out: number
  declare duration_ms: number
  declare status_code: number
  declare flagged: boolean
  declare is_classification_correct: boolean | null
  declare correction_reason: string | null
  declare framework_id: string | null
  declare detector: string | null
  declare confidence: number | null
  declare action: string | null
  declare threat_title: string | null
  declare excerpt: string | null
  declare user_prompt: string | null
  declare response_body: string | null
  declare upstream_provider_id: string | null
  declare upstream_provider_name: string | null
  declare classifier_provider_id: string | null
  declare classifier_provider_name: string | null
  declare is_benign: boolean
  declare marked_by: string | null
  declare reason: string | null
  declare marked_at: Date | null
  declare output_scan_flagged: boolean | null
  declare output_scan_framework_id: string | null
  declare output_scan_confidence: number | null
  declare output_scan_detector: string | null
  declare threat_knowledge_matches: unknown | null
  declare semantic_threshold: number | null
  declare false_positive_candidate: boolean
  declare pipeline_trace: unknown | null
  declare final_decision: string | null
  declare blocked_stage: string | null
  declare classification_reason: string | null
  declare t2_flagged: boolean | null
  declare t2_confidence: number | null
  declare t2_reason: string | null
  declare request_mutations: string | null
  declare user_agent: string | null
  declare gateway_instance_id: string | null
  declare raw_input_payload: string | null
  declare raw_output_payload: string | null
  declare cache_hit: boolean | null
  declare cache_tier: string | null
  declare content_quality_scanned: boolean | null
  declare content_quality_groundedness: number | null
  declare content_quality_relevance: number | null
  declare content_quality_hallucination: number | null
  declare content_quality_flagged: boolean | null
  declare content_quality_action: string | null
  declare content_quality_reason: string | null
  declare readonly created_at: Date
}

export function initAiRequestLogModel(sequelize: Sequelize): typeof AiRequestLog {
  AiRequestLog.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      request_id: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      app_id: { type: DataTypes.STRING(50), allowNull: false },
      app_name: { type: DataTypes.STRING(255), allowNull: false },
      model: { type: DataTypes.STRING(100), allowNull: false },
      method: { type: DataTypes.STRING(20), allowNull: false },
      path: { type: DataTypes.STRING(255), allowNull: false },
      source_ip: { type: DataTypes.STRING(45), allowNull: false },
      app_api_key: { type: DataTypes.STRING(255), allowNull: false },
      tokens_in: { type: DataTypes.INTEGER, allowNull: false },
      tokens_out: { type: DataTypes.INTEGER, allowNull: false },
      duration_ms: { type: DataTypes.INTEGER, allowNull: false },
      status_code: { type: DataTypes.SMALLINT, allowNull: false },
      flagged: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_classification_correct: { type: DataTypes.BOOLEAN, allowNull: true },
      correction_reason: { type: DataTypes.TEXT, allowNull: true },
      framework_id: { type: DataTypes.STRING(50), allowNull: true },
      detector: { type: DataTypes.STRING(100), allowNull: true },
      confidence: { type: DataTypes.FLOAT, allowNull: true },
      action: { type: DataTypes.STRING(20), allowNull: true },
      threat_title: { type: DataTypes.TEXT, allowNull: true },
      excerpt: { type: DataTypes.TEXT, allowNull: true },
      user_prompt: { type: DataTypes.TEXT, allowNull: true },
      response_body: { type: DataTypes.TEXT, allowNull: true },
      upstream_provider_id: { type: DataTypes.STRING(100), allowNull: true },
      upstream_provider_name: { type: DataTypes.STRING(255), allowNull: true },
      classifier_provider_id: { type: DataTypes.STRING(100), allowNull: true },
      classifier_provider_name: { type: DataTypes.STRING(255), allowNull: true },
      is_benign: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      marked_by: { type: DataTypes.STRING(255), allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: true },
      marked_at: { type: DataTypes.DATE, allowNull: true },
      output_scan_flagged: { type: DataTypes.BOOLEAN, allowNull: true },
      output_scan_framework_id: { type: DataTypes.STRING(50), allowNull: true },
      output_scan_confidence: { type: DataTypes.FLOAT, allowNull: true },
      output_scan_detector: { type: DataTypes.STRING(200), allowNull: true },
      threat_knowledge_matches: { type: DataTypes.JSONB, allowNull: true },
      semantic_threshold: { type: DataTypes.DOUBLE, allowNull: true },
      false_positive_candidate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      pipeline_trace: { type: DataTypes.JSONB, allowNull: true },
      final_decision: { type: DataTypes.STRING(32), allowNull: true },
      blocked_stage: { type: DataTypes.STRING(64), allowNull: true },
      classification_reason: { type: DataTypes.TEXT, allowNull: true },
      t2_flagged:         { type: DataTypes.BOOLEAN, allowNull: true },
      t2_confidence:      { type: DataTypes.FLOAT,   allowNull: true },
      t2_reason:          { type: DataTypes.TEXT,    allowNull: true },
      request_mutations:  { type: DataTypes.TEXT,    allowNull: true },
      user_agent:         { type: DataTypes.TEXT,    allowNull: true },
      gateway_instance_id: { type: DataTypes.STRING(50), allowNull: true },
      raw_input_payload:   { type: DataTypes.TEXT, allowNull: true },
      raw_output_payload:  { type: DataTypes.TEXT, allowNull: true },
      cache_hit:           { type: DataTypes.BOOLEAN, allowNull: true },
      cache_tier:          { type: DataTypes.STRING(20), allowNull: true },
      content_quality_scanned:       { type: DataTypes.BOOLEAN, allowNull: true },
      content_quality_groundedness:  { type: DataTypes.DOUBLE,  allowNull: true },
      content_quality_relevance:     { type: DataTypes.DOUBLE,  allowNull: true },
      content_quality_hallucination: { type: DataTypes.DOUBLE,  allowNull: true },
      content_quality_flagged:       { type: DataTypes.BOOLEAN, allowNull: true },
      content_quality_action:        { type: DataTypes.TEXT,    allowNull: true },
      content_quality_reason:        { type: DataTypes.TEXT,    allowNull: true },
    },
    {
      sequelize,
      tableName: 'ai_request_logs',
      modelName: 'AiRequestLog',
      timestamps: true,
      updatedAt: false,
      underscored: true,
    }
  )
  return AiRequestLog
}
