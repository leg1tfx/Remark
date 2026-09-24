//! Turning raw Ollama output into the text or labels the user asked for.
//!
//! The model is asked for a JSON object like `{"formatted_markdown": "..."}`.
//! Whatever lives inside that field is the user's text and must never be trimmed
//! beyond whitespace and an enclosing ```markdown fence. Only when the model
//! ignored the JSON format do we strip an obvious chatty preamble.

/// Extract `key` from the model output, falling back to the raw text.
pub fn extract_field(raw: &str, key: &str) -> String {
    let raw = raw.trim();
    let text = match serde_json::from_str::<serde_json::Value>(raw) {
        Ok(serde_json::Value::Object(map)) => {
            let field = map.get(key).and_then(|v| v.as_str()).or_else(|| {
                // Some small models pick their own key; accept a single string field.
                let mut strings = map.values().filter_map(|v| v.as_str());
                match (strings.next(), strings.next()) {
                    (Some(only), None) => Some(only),
                    _ => None,
                }
            });
            match field {
                Some(s) => s.to_string(),
                None => raw.to_string(),
            }
        }
        Ok(serde_json::Value::String(s)) => s,
        _ => strip_preamble(raw).to_string(),
    };
    unwrap_code_fence(text.trim()).trim().to_string()
}

/// If the whole text is a single ``` / ```markdown block, return its contents.
pub fn unwrap_code_fence(text: &str) -> &str {
    let Some(first_nl) = text.find('\n') else {
        return text;
    };
    let opening = text[..first_nl].trim();
    let lang = match opening.strip_prefix("```") {
        Some(lang) => lang.trim().to_ascii_lowercase(),
        None => return text,
    };
    if !matches!(lang.as_str(), "" | "md" | "markdown") {
        return text;
    }
    let body = &text[first_nl + 1..];
    let Some(inner) = body.trim_end().strip_suffix("```") else {
        return text;
    };
    // A second fence inside means the text contains several blocks, not one wrapper.
    if inner.lines().any(|l| l.trim_start().starts_with("```")) {
        return text;
    }
    inner.trim_end_matches(['\n', '\r'])
}

const PREAMBLE_STARTS: &[&str] = &[
    "here is",
    "here's",
    "here are",
    "sure",
    "certainly",
    "okay",
    "ok,",
    "of course",
    "below is",
    "hier ist",
    "hier sind",
    "gerne",
    "natürlich",
    "klar",
];

/// Drop a single leading line such as "Here is the formatted text:".
pub fn strip_preamble(text: &str) -> &str {
    let trimmed = text.trim_start();
    let (first, rest) = match trimmed.find('\n') {
        Some(i) => (&trimmed[..i], &trimmed[i + 1..]),
        None => return text,
    };
    let line = first.trim().to_lowercase();
    let looks_like_preamble = line.ends_with(':')
        && line.chars().count() <= 120
        && PREAMBLE_STARTS.iter().any(|p| line.starts_with(p));
    if looks_like_preamble && !rest.trim().is_empty() {
        rest.trim_start_matches(['\n', '\r'])
    } else {
        text
    }
}

/// Block types the formatter can assign to a line (see `src/structure.ts`).
pub const LABELS: &[&str] = &[
    "heading1",
    "heading2",
    "heading3",
    "bullet",
    "numbered",
    "quote",
    "paragraph",
];

fn normalize_label(label: &str) -> &'static str {
    let l = label
        .trim()
        .to_ascii_lowercase()
        .replace([' ', '_', '-'], "");
    match l.as_str() {
        "heading1" | "h1" | "title" => "heading1",
        "heading2" | "h2" | "heading" | "section" => "heading2",
        "heading3" | "h3" | "subheading" => "heading3",
        "bullet" | "bullets" | "list" | "listitem" | "bulletlist" | "unordered" => "bullet",
        "numbered" | "ordered" | "orderedlist" | "numberedlist" | "step" => "numbered",
        "quote" | "blockquote" => "quote",
        // Anything unknown leaves the line untouched.
        _ => "paragraph",
    }
}

/// Read `{"labels": [...]}` (or a bare array) with exactly `n` entries.
/// Missing entries become "paragraph" (= leave the line as it is), extra ones are dropped.
pub fn parse_labels(raw: &str, n: usize) -> Result<Vec<String>, String> {
    let value: serde_json::Value = serde_json::from_str(raw.trim())
        .map_err(|_| "The AI answer could not be read, please try again".to_string())?;
    let items = match &value {
        serde_json::Value::Array(a) => a,
        serde_json::Value::Object(map) => match map
            .get("labels")
            .or_else(|| map.values().find(|v| v.is_array()))
        {
            Some(serde_json::Value::Array(a)) => a,
            _ => return Err("The AI answer contained no labels".to_string()),
        },
        _ => return Err("The AI answer contained no labels".to_string()),
    };
    let mut labels: Vec<String> = items
        .iter()
        .take(n)
        .map(|v| normalize_label(v.as_str().unwrap_or("")).to_string())
        .collect();
    labels.resize(n, "paragraph".to_string());
    Ok(labels)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_first_plain_paragraph_from_json() {
        let raw = r#"{"formatted_markdown": "Hallo zusammen.\n\n- Punkt 1\n- Punkt 2"}"#;
        assert_eq!(
            extract_field(raw, "formatted_markdown"),
            "Hallo zusammen.\n\n- Punkt 1\n- Punkt 2"
        );
    }

    #[test]
    fn keeps_plain_text_without_markdown() {
        let raw = r#"{"corrected": "Das ist ein Satz."}"#;
        assert_eq!(extract_field(raw, "corrected"), "Das ist ein Satz.");
    }

    #[test]
    fn accepts_single_unexpected_key() {
        let raw = r#"{"text": "Only field"}"#;
        assert_eq!(extract_field(raw, "formatted_markdown"), "Only field");
    }

    #[test]
    fn unwraps_markdown_fence_inside_json() {
        let raw = r#"{"formatted_markdown": "```markdown\n# Title\n\nBody\n```"}"#;
        assert_eq!(extract_field(raw, "formatted_markdown"), "# Title\n\nBody");
    }

    #[test]
    fn keeps_code_blocks_that_are_content() {
        let text = "```rust\nfn main() {}\n```";
        assert_eq!(unwrap_code_fence(text), text);
        let two = "```\na\n```\n\ntext\n\n```\nb\n```";
        assert_eq!(unwrap_code_fence(two), two);
    }

    #[test]
    fn strips_preamble_only_for_non_json() {
        let raw = "Here is the formatted text:\n\n# Title\nBody";
        assert_eq!(extract_field(raw, "formatted_markdown"), "# Title\nBody");
        let raw = "Hallo zusammen:\n- a\n- b";
        assert_eq!(extract_field(raw, "formatted_markdown"), raw);
    }

    #[test]
    fn parses_labels_and_pads_to_length() {
        let raw = r#"{"labels": ["heading1", "Bullet", "h2", "nonsense"]}"#;
        assert_eq!(
            parse_labels(raw, 5).unwrap(),
            ["heading1", "bullet", "heading2", "paragraph", "paragraph"]
        );
        assert_eq!(
            parse_labels(r#"["quote", "numbered"]"#, 1).unwrap(),
            ["quote"]
        );
        assert!(parse_labels("no json", 2).is_err());
        assert!(parse_labels(r#"{"x": 1}"#, 2).is_err());
    }

    #[test]
    fn preamble_alone_is_kept() {
        assert_eq!(strip_preamble("Here is:"), "Here is:");
    }
}
