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

            // Deterministic Bit-based Breadcrumb Encoding
            // START (\u{FEFF}) + FileID(bits) + SEP (\u{200D}) + Line(bits) + END (\u{FEFF})
            let bin_file = format!("{:b}", file.file_index);
            let bin_line = format!("{:b}", line_num);

            let mut marker = String::from('\u{FEFF}');
            
            for bit in bin_file.chars() {
                marker.push(if bit == '1' { '\u{200C}' } else { '\u{200B}' });
            }
            
            marker.push('\u{200D}'); // SEP

            for bit in bin_line.chars() {
                marker.push(if bit == '1' { '\u{200C}' } else { '\u{200B}' });
            }

            marker.push('\u{FEFF}'); // END
            
            output.push_str(&marker);
            output.push_str(mat.as_str());

            global_map.insert(format!("{}_{}", file.file_index, line_num), file.path.clone());
            
            // Track line numbers
            line_num += mat.as_str().split('\n').count() as u32 - 1;
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
/**
 * Universal Breadcrumb Stripper (Rust-WASM Version)
 * Removes all Zero-Width markers from a batch of files for clean Git commits.
 */
#[wasm_bindgen]
pub fn strip_batch(input_json: &str) -> String {
    let files: Vec<FileInfo> = serde_json::from_str(input_json).unwrap_or_else(|_| vec![]);
    let mut results = Vec::new();
    
    // Regex matching all our invisible marker characters
    let re_strip = Regex::new(r"[\u{FEFF}\u{200B}\u{200C}\u{200D}]").unwrap();

    for file in files {
        let clean = re_strip.replace_all(&file.content, "");
        results.push(InstrumentationResult {
            path: file.path,
            content: clean.into_owned(),
            map: HashMap::new(),
        });
    }

    serde_json::to_string(&results).unwrap()
}
