/// Provider usage meter checking for forwarding decisions.
use crate::policy::ProviderConfig;
use crate::tools::provider_meter::{MeterDecision, ProviderMeterConfig};

/// Decision from checking provider meter limits.
pub enum MeterCheckResult {
    /// Meter exceeded with hard enforcement — skip this provider.
    Exceeded { period_end: chrono::DateTime<chrono::Utc> },
    /// Meter exceeded but soft enforcement — allow and warn.
    SoftExceeded,
    /// Meter warning threshold reached.
    Warning,
    /// Meter is fine.
    Ok,
}

/// Check provider meter limits and return a decision.
pub async fn check_provider_meter(
    request_id: &str,
    slot: &str,
    provider: &ProviderConfig,
    meter: &crate::tools::provider_meter::ProviderMeter,
) -> Option<MeterCheckResult> {
    if provider.meter_mode != "monthly" {
        return None;
    }

    let limit = match provider.meter_limit {
        Some(l) => l,
        None => return None,
    };

    let mcfg = ProviderMeterConfig {
        metric: provider.meter_metric.clone(),
        limit,
        warning: provider.meter_warning,
        enforcement: provider.meter_enforcement.clone(),
        reset_day: provider.meter_reset_day.unwrap_or(1),
        price_in: provider.price_per_1m_input,
        price_out: provider.price_per_1m_output,
        period_start_override: provider.meter_period_start,
    };

    let decision = match crate::tools::provider_meter::ProviderMeter::check(meter, &provider.id, &mcfg).await {
        MeterDecision::Exceeded { used, limit: lim, enforcement, period_end }
            if enforcement == "hard" =>
        {
            tracing::warn!("[meter] {} METER_EXCEEDED_SKIP {} provider=\"{}\" used={}/{} trying_next",
                request_id, slot, provider.name, used, lim);
            MeterCheckResult::Exceeded { period_end }
        }
        MeterDecision::Exceeded { used, limit: lim, .. } => {
            tracing::warn!("[meter] {} METER_OVER_SOFT {} provider=\"{}\" used={}/{} — allowing",
                request_id, slot, provider.name, used, lim);
            MeterCheckResult::SoftExceeded
        }
        MeterDecision::Allowed { warning: true, used, limit: lim } => {
            tracing::warn!("[meter] {} METER_WARNING {} provider=\"{}\" used={}/{}", request_id, slot, provider.name, used, lim);
            MeterCheckResult::Warning
        }
        MeterDecision::Allowed { .. } => MeterCheckResult::Ok,
    };

    Some(decision)
}
