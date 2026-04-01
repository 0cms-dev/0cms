use wasm_bindgen::prelude::*;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub content: String,
    pub file_index: u32,
}

#[derive(Serialize, Deserialize)]
pub struct InstrumentationResult {
    pub path: String,
    pub content: String,
    pub map: HashMap<String, String>,
}

/**
 * Universal Tagging Engine (Rust-WASM Version)
 * Performs high-performance Unicode instrumentation on template files.
 */
#[wasm_bindgen]
pub fn instrument_batch(input_json: &str) -> String {
    let files: Vec<FileInfo> = serde_json::from_str(input_json).unwrap_or_else(|_| vec![]);
    let mut results = Vec::new();
    let mut global_map = HashMap::new();

    // Universal Regex for Tags (HTML, Blade, Liquid, PHP)
    let re_tag = Regex::new(r"(<([a-zA-Z0-9-]+)[^>]*>)|(\{\{[^}]*\}\})|(\{%.*?%\})|(<\?php.*?\?>)|(@(?:if|foreach|for|while|extends|section|yield|include|component).*?$)").unwrap();

    for file in files {
        let mut line_num = 1;
        let mut output = String::new();
        let mut last_pos = 0;

        for cap in re_tag.captures_iter(&file.content) {
            let mat = cap.get(0).unwrap();
            output.push_str(&file.content[last_pos..mat.start()]);

            // Generate the Deterministic Breadcrumb (Unicode Marker)
            // Format: \u{200B}\u{200C} + Index(Hex) + Line(Hex) + \u{200C}
            let marker_id = format!("{:x}_{:x}", file.file_index, line_num);
            let marker = format!("\u{200B}\u{200C}{}\u{200C}", marker_id);
            
            output.push_str(&marker);
            output.push_str(mat.as_str());

            global_map.insert(marker_id, file.path.clone());
            
            // Track line numbers
            line_num += mat.as_str().split('\n').count() - 1;
            last_pos = mat.end();
        }

        output.push_str(&file.content[last_pos..]);
        
        results.push(InstrumentationResult {
            path: file.path,
            content: output,
            map: global_map.clone(),
        });
    }

    serde_json::to_string(&results).unwrap()
}
