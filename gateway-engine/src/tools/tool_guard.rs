//! Check each tool in the request against the app's blocked tools list.
//! Empty or absent list = nothing blocked = all tools are allowed.

use std::collections::HashSet;

use crate::content::parser::{ParsedRequest, ToolCheckResult, ToolViolation};

#[derive(Clone)]
pub struct ToolGuard {
    pub blocked_tools: HashSet<String>,
}

impl ToolGuard {
    pub fn check_request(&self, parsed: &ParsedRequest) -> ToolCheckResult {
        match &parsed.tools {
            Some(tools) if !tools.is_empty() => {
                let mut violations = vec![];

                for tool in tools {
                    if self.blocked_tools.contains(&tool.name) {
                        violations.push(ToolViolation::BlockedTool(tool.name.clone()));
                    }
                }

                ToolCheckResult {
                    allowed: violations.is_empty(),
                    violations,
                    tool_names: tools.iter().map(|t| t.name.clone()).collect(),
                }
            }
            _ => ToolCheckResult {
                allowed: true,
                violations: vec![],
                tool_names: vec![],
            },
        }
    }
}
