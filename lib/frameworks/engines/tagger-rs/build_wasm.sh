#!/bin/bash

# ZeroCMS WASM Tagger Build Script
# This script compiles the Rust tagger into a WASM binary compatible with the Dashboard.

set -e

# 1. Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🚀 Building ZeroCMS Rust Tagger...${NC}"

# 2. Check for wasm-pack
if ! command -v wasm-pack &> /dev/null
then
    echo -e "${YELLOW}[!] wasm-pack not found. Attempting manual cargo build...${NC}"
    
    # Check for wasm32 target
    if ! rustup target list --installed | grep -q "wasm32-unknown-unknown"; then
        echo -e "${YELLOW}[!] wasm32 target not found. Installing...${NC}"
        rustup target add wasm32-unknown-unknown
    fi

    # Manual build
    cargo build --target wasm32-unknown-unknown --release
    
    # Note: Manual build requires wasm-bindgen-cli to generate the glue code.
    # For now, we recommend installing wasm-pack for the best experience.
    echo -e "${YELLOW}[!] Manual build complete, but glue code generation requires wasm-bindgen-cli.${NC}"
    echo -e "Please install wasm-pack: ${GREEN}curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh${NC}"
    exit 1
fi

# 3. Build with wasm-pack
wasm-pack build --target web --release

# 4. Copy to lib
echo -e "${GREEN}📦 Copying binary to dashboard library...${NC}"
cp pkg/zerocms_tagger_bg.wasm ../../../../lib/zerocms_tagger_bg.wasm

echo -e "${GREEN}✨ Success! High-performance tagger is now active.${NC}"
