#!/usr/bin/env bash
# GoodVibes Plugin Install/Reinstall Script (macOS Double-Clickable)
# Uninstalls and reinstalls the GoodVibes plugin from the marketplace
#
# This .command file can be double-clicked in Finder to run

# Change to the script directory
cd "$(dirname "$0")"

set -e

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo ""
echo -e "${MAGENTA}GoodVibes Plugin Install (macOS)${NC}"
echo -e "${MAGENTA}=================================${NC}"
echo ""

# Step 1: Uninstall plugin
echo -e "${CYAN}[1/4] Uninstalling GoodVibes plugin...${NC}"
if claude plugin uninstall goodvibes@goodvibes-market 2>/dev/null; then
    echo -e "${GREEN}  Plugin uninstalled${NC}"
else
    echo -e "${YELLOW}  Plugin was not installed (continuing)${NC}"
fi

# Step 2: Remove marketplace
echo -e "${CYAN}[2/4] Removing GoodVibes marketplace...${NC}"
if claude plugin marketplace remove goodvibes-market 2>/dev/null; then
    echo -e "${GREEN}  Marketplace removed${NC}"
else
    echo -e "${YELLOW}  Marketplace was not registered (continuing)${NC}"
fi

# Step 3: Add marketplace
echo -e "${CYAN}[3/4] Adding GoodVibes marketplace...${NC}"
if ! claude plugin marketplace add mgd34msu/goodvibes-plugin 2>/dev/null; then
    echo -e "${RED}Failed to add marketplace${NC}"
    echo ""
    echo "Press any key to close..."
    read -n 1
    exit 1
fi
echo -e "${GREEN}  Marketplace added${NC}"

# Step 4: Install plugin
echo -e "${CYAN}[4/4] Installing GoodVibes plugin...${NC}"
if ! claude plugin install goodvibes@goodvibes-market 2>/dev/null; then
    echo -e "${RED}Failed to install plugin${NC}"
    echo ""
    echo "Press any key to close..."
    read -n 1
    exit 1
fi
echo -e "${GREEN}  Plugin installed${NC}"

echo ""
echo -e "${GREEN}Done! GoodVibes plugin installed successfully.${NC}"
echo ""
echo "Press any key to close..."
read -n 1
