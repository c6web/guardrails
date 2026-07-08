//! Parse OpenAI-compatible request format to extract tool definitions.

use serde_json::Value;

#[derive(Debug, Clone)]
pub struct ParsedRequest {
    pub tools: Option<Vec<ToolDefinition>>,
}

#[derive(Debug, Clone)]
pub struct ToolDefinition {
    pub name: String,
}

impl ParsedRequest {
    pub fn parse(request: &Value) -> Result<Self, &'static str> {
        Ok(ParsedRequest {
            tools: Self::parse_tools(request),
        })
    }

    fn parse_tools(request: &Value) -> Option<Vec<ToolDefinition>> {
        request.get("tools").and_then(|v| v.as_array()).map(|arr| {
            arr.iter().filter_map(|tool| {
                let name = tool.get("function").and_then(|f| f.get("name")).and_then(|n| n.as_str());
                name.map(|n| ToolDefinition { name: n.to_string() })
            }).collect()
        })
    }
}

#[derive(Debug)]
pub struct ToolCheckResult {
    pub allowed: bool,
    pub violations: Vec<ToolViolation>,
    pub tool_names: Vec<String>,
}

#[derive(Debug, Clone)]
pub enum ToolViolation {
    BlockedTool(String),
}
