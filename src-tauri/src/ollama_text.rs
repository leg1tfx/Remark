//! Turning raw Ollama output into the text the user asked for.
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
    fn preamble_alone_is_kept() {
        assert_eq!(strip_preamble("Here is:"), "Here is:");
    }
}
