/// Iterate over every tool_call argument string in an OpenAI-style response.
/// Walks `choices[].message.tool_calls[].function.arguments` and calls `f`
/// with each argument string found.
pub fn for_each_tool_call_args<F>(value: &serde_json::Value, mut f: F)
where
    F: FnMut(&str),
{
    if let Some(choices) = value.get("choices").and_then(|v| v.as_array()) {
        for choice in choices {
            if let Some(tool_calls) = choice.pointer("/message/tool_calls").and_then(|v| v.as_array()) {
                for tc in tool_calls {
                    if let Some(args) = tc.pointer("/function/arguments").and_then(|v| v.as_str()) {
                        f(args);
                    }
                }
            }
        }
    }
}

/// Iterate over tool_call argument values in a `tool_calls` array, with mutable
/// access. Calls `f` with each `function.arguments` as `&mut Value`.
pub fn for_each_tool_call_args_mut<F>(tool_calls: &mut [serde_json::Value], mut f: F)
where
    F: FnMut(&mut serde_json::Value),
{
    for tc in tool_calls.iter_mut() {
        if let Some(func) = tc.get_mut("function")
            && let Some(args) = func.get_mut("arguments") {
                f(args);
            }
    }
}
