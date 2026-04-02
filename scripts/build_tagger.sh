#!/bin/bash
set -e

# build_tagger.sh
# Compiles the Rust-WASM "Super Tagger" and deploys it to the ZeroCMS library.

PROJECT_ROOT=$(pwd)
RUST_DIR="$PROJECT_ROOT/lib/frameworks/engines/tagger-rs"
TARGET_DIR="$PROJECT_ROOT/lib"

echo "🦀 Building ZeroCMS Super Tagger (WASM)..."

# 1. Check for wasm-pack
if ! command -v wasm-pack &> /dev/null; then
    echo "⚠️ wasm-pack not found. Attempting to install..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# 2. Build the project
cd "$RUST_DIR"
echo "📦 Running wasm-pack build..."
wasm-pack build --target web --release

# 3. Deploy to lib/
echo "🚀 Deploying WASM binary and glue code..."
cp pkg/zerocms_tagger_bg.wasm "$TARGET_DIR/zerocms_tagger_bg.wasm"
cp pkg/zerocms_tagger.js "$TARGET_DIR/zerocms_tagger.js"

cd "$PROJECT_ROOT"
echo "✅ Super Tagger deployed successfully to lib/"
