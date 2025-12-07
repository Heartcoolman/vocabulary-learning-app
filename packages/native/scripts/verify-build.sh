#!/bin/bash
# packages/native/scripts/verify-build.sh
# Cross-platform build verification script for @danci/native

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}=== Native Module Build Verification ===${NC}"
echo ""

# Check Rust toolchain
echo -e "${YELLOW}[1/6] Checking Rust toolchain...${NC}"
if command -v rustc &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} rustc: $(rustc --version)"
else
    echo -e "  ${RED}✗${NC} rustc not found"
    exit 1
fi

if command -v cargo &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} cargo: $(cargo --version)"
else
    echo -e "  ${RED}✗${NC} cargo not found"
    exit 1
fi

# Check Node.js and pnpm
echo ""
echo -e "${YELLOW}[2/6] Checking Node.js environment...${NC}"
if command -v node &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} node: $(node --version)"
else
    echo -e "  ${RED}✗${NC} node not found"
    exit 1
fi

if command -v pnpm &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} pnpm: $(pnpm --version)"
elif command -v npm &> /dev/null; then
    echo -e "  ${YELLOW}!${NC} pnpm not found, npm: $(npm --version)"
else
    echo -e "  ${RED}✗${NC} Neither pnpm nor npm found"
    exit 1
fi

# Check installed targets
echo ""
echo -e "${YELLOW}[3/6] Checking installed Rust targets...${NC}"
echo ""

REQUIRED_TARGETS=(
    "x86_64-unknown-linux-gnu"
    "x86_64-unknown-linux-musl"
    "aarch64-unknown-linux-gnu"
    "aarch64-unknown-linux-musl"
    "x86_64-apple-darwin"
    "aarch64-apple-darwin"
    "x86_64-pc-windows-msvc"
)

INSTALLED_TARGETS=$(rustup target list --installed 2>/dev/null || echo "")

echo "  Required targets for cross-platform builds:"
for target in "${REQUIRED_TARGETS[@]}"; do
    if echo "$INSTALLED_TARGETS" | grep -q "^${target}$"; then
        echo -e "    ${GREEN}✓${NC} $target (installed)"
    else
        echo -e "    ${YELLOW}○${NC} $target (not installed)"
    fi
done

# Detect current platform
echo ""
echo -e "${YELLOW}[4/6] Detecting current platform...${NC}"
CURRENT_TARGET=""
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Linux)
        case "$ARCH" in
            x86_64)
                # Check if musl or glibc
                if ldd --version 2>&1 | grep -q musl; then
                    CURRENT_TARGET="x86_64-unknown-linux-musl"
                else
                    CURRENT_TARGET="x86_64-unknown-linux-gnu"
                fi
                ;;
            aarch64)
                if ldd --version 2>&1 | grep -q musl; then
                    CURRENT_TARGET="aarch64-unknown-linux-musl"
                else
                    CURRENT_TARGET="aarch64-unknown-linux-gnu"
                fi
                ;;
        esac
        ;;
    Darwin)
        case "$ARCH" in
            x86_64)
                CURRENT_TARGET="x86_64-apple-darwin"
                ;;
            arm64)
                CURRENT_TARGET="aarch64-apple-darwin"
                ;;
        esac
        ;;
    MINGW*|CYGWIN*|MSYS*)
        CURRENT_TARGET="x86_64-pc-windows-msvc"
        ;;
esac

if [ -n "$CURRENT_TARGET" ]; then
    echo -e "  ${GREEN}✓${NC} Detected: $CURRENT_TARGET"
else
    echo -e "  ${YELLOW}!${NC} Unknown platform: $OS / $ARCH"
fi

# Build for current platform
echo ""
echo -e "${YELLOW}[5/6] Building for current platform...${NC}"
cd "$NATIVE_DIR"

# Clean previous builds
rm -f *.node 2>/dev/null || true

# Run build
if command -v pnpm &> /dev/null; then
    pnpm build
else
    npm run build
fi

# Verify generated files
echo ""
echo -e "${YELLOW}[6/6] Verifying generated files...${NC}"
NODE_FILES=$(ls -la *.node 2>/dev/null || echo "")

if [ -n "$NODE_FILES" ]; then
    echo -e "  ${GREEN}✓${NC} Generated .node files:"
    ls -la *.node | while read line; do
        echo "    $line"
    done
else
    echo -e "  ${RED}✗${NC} No .node files found"
    exit 1
fi

# Run tests
echo ""
echo -e "${YELLOW}[Bonus] Running tests...${NC}"
if command -v pnpm &> /dev/null; then
    pnpm test
else
    npm test
fi

echo ""
echo -e "${GREEN}=== Build verification complete ===${NC}"
echo ""
echo "Summary:"
echo "  - Platform: $CURRENT_TARGET"
echo "  - Generated: $(ls *.node 2>/dev/null | wc -l | tr -d ' ') .node file(s)"
echo ""
echo "To install additional targets for cross-compilation:"
echo "  rustup target add <target>"
echo ""
echo "Available targets:"
for target in "${REQUIRED_TARGETS[@]}"; do
    echo "  - $target"
done
