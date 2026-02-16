#!/usr/bin/env bash

# Requires: bash 4+ (uses arrays, [[ ]])
# validate-ai-integration.sh
# Validates AI integration implementation for security and best practices
#
# Usage: ./validate-ai-integration.sh <project_root>
#
# Checks:
#   1. AI SDK or LLM library installed
#   2. API keys documented in .env.example
#   3. Streaming endpoints exist
#   4. No hardcoded API keys in source
#   5. Rate limiting configured
#   6. Error handling around AI calls
#   7. Token/cost tracking patterns
#
# Exit codes:
#   0 = all checks passed
#   1 = one or more checks failed

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Disable colors when not running in a terminal
if [ ! -t 1 ]; then
  RED='' GREEN='' YELLOW='' NC=''
fi

# Usage
if [[ $# -lt 1 ]]; then
  printf "Usage: %s <project_root>\n" "$0"
  printf "\n"
  printf "Validates AI integration implementation.\n"
  printf "\n"
  printf "Checks:\n"
  printf "  1. AI SDK or LLM library installed\n"
  printf "  2. API keys in .env.example\n"
  printf "  3. Streaming endpoints exist\n"
  printf "  4. No hardcoded API keys\n"
  printf "  5. Rate limiting configured\n"
  printf "  6. Error handling present\n"
  printf "  7. Token/cost tracking\n"
  printf "\n"
  printf "Exit codes:\n"
  printf "  0 = PASS\n"
  printf "  1 = FAIL\n"
  exit 1
fi

PROJECT_ROOT="$1"

if [[ ! -d "$PROJECT_ROOT" ]]; then
  printf "%bERROR: Directory not found: %s%b\n" "$RED" "$PROJECT_ROOT" "$NC"
  exit 1
fi

# Violation tracking
VIOLATIONS=()
WARNINGS=()

# Helper: Add violation
add_violation() {
  VIOLATIONS+=("$1")
}

# Helper: Add warning
add_warning() {
  WARNINGS+=("$1")
}

printf "Validating AI integration in: %s\n" "$PROJECT_ROOT"
printf "\n"

# ============================================================================
# CHECK 1: AI SDK or LLM library installed
# ============================================================================

printf "[1/7] Checking for AI/LLM libraries...\n"

AI_LIB_FOUND=false

if [[ -f "$PROJECT_ROOT/package.json" ]]; then
  # Check for Vercel AI SDK
  if grep -q '"ai"' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b Vercel AI SDK found\n" "$GREEN" "$NC"
    AI_LIB_FOUND=true
  fi
  
  # Check for OpenAI
  if grep -q '"openai"' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b OpenAI SDK found\n" "$GREEN" "$NC"
    AI_LIB_FOUND=true
  fi
  
  # Check for Anthropic
  if grep -q '"@anthropic-ai/sdk"' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b Anthropic SDK found\n" "$GREEN" "$NC"
    AI_LIB_FOUND=true
  fi
  
  # Check for LangChain
  if grep -q '"langchain"' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b LangChain found\n" "$GREEN" "$NC"
    AI_LIB_FOUND=true
  fi
  
  # Check for LlamaIndex
  if grep -q '"llamaindex"' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b LlamaIndex found\n" "$GREEN" "$NC"
    AI_LIB_FOUND=true
  fi
fi

if [[ "$AI_LIB_FOUND" == false ]]; then
  add_violation "No AI/LLM library found. Install ai, openai, @anthropic-ai/sdk, langchain, or llamaindex."
fi

# ============================================================================
# CHECK 2: API keys documented in .env.example
# ============================================================================

printf "[2/7] Checking for API key documentation...\n"

KEYS_DOCUMENTED=false

if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
  if grep -qE 'OPENAI_API_KEY|ANTHROPIC_API_KEY|COHERE_API_KEY|HUGGINGFACE_API_KEY' -- "$PROJECT_ROOT/.env.example"; then
    printf "  %b[PASS]%b API keys documented in .env.example\n" "$GREEN" "$NC"
    KEYS_DOCUMENTED=true
  else
    add_violation "No AI API keys found in .env.example. Document required keys."
  fi
else
  add_violation ".env.example not found. Create it to document API keys."
fi

# ============================================================================
# CHECK 3: Streaming endpoints exist
# ============================================================================

printf "[3/7] Checking for streaming endpoints...\n"

STREAMING_FOUND=false

if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
     --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
     -E 'streamText|toDataStreamResponse|ReadableStream|StreamingTextResponse' -- "$PROJECT_ROOT" | grep -q .; then
  printf "  %b[PASS]%b Streaming implementation found\n" "$GREEN" "$NC"
  STREAMING_FOUND=true
fi

if [[ "$STREAMING_FOUND" == false ]]; then
  add_warning "No streaming implementation detected. Consider using streaming for better UX."
fi

# ============================================================================
# CHECK 4: No hardcoded API keys in source
# ============================================================================

printf "[4/7] Checking for hardcoded API keys...\n"

# Pattern matches OpenAI, Anthropic, Cohere key formats
HARDCODED_KEYS=false

if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
     --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
     -E 'sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9-]{20,}' -- "$PROJECT_ROOT" | grep -q .; then
  add_violation "Hardcoded API keys detected. Move all keys to environment variables."
  HARDCODED_KEYS=true
fi

if [[ "$HARDCODED_KEYS" == false ]]; then
  printf "  %b[PASS]%b No hardcoded API keys detected\n" "$GREEN" "$NC"
fi

# ============================================================================
# CHECK 5: Rate limiting configured
# ============================================================================

printf "[5/7] Checking for rate limiting...\n"

RATE_LIMIT_FOUND=false

if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
     --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
     -E 'Ratelimit|ratelimit|rate.limit|429' -- "$PROJECT_ROOT" | grep -q .; then
  printf "  %b[PASS]%b Rate limiting implementation found\n" "$GREEN" "$NC"
  RATE_LIMIT_FOUND=true
fi

if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
     --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
     -E '@upstash/ratelimit|express-rate-limit|bottleneck' -- "$PROJECT_ROOT" | grep -q .; then
  printf "  %b[PASS]%b Rate limiting library found\n" "$GREEN" "$NC"
  RATE_LIMIT_FOUND=true
fi

if [[ "$RATE_LIMIT_FOUND" == false ]]; then
  add_warning "No rate limiting detected. Implement rate limiting to prevent abuse."
fi

# ============================================================================
# CHECK 6: Error handling around AI calls
# ============================================================================

printf "[6/7] Checking error handling...\n"

ERROR_HANDLING_FOUND=false

# Look for try/catch around common AI SDK calls
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
     --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
     -B 5 -E 'streamText|generateText|chat\.completions|messages\.create' -- "$PROJECT_ROOT" | \
     grep -q 'try'; then
  printf "  %b[PASS]%b Try/catch blocks found around AI calls\n" "$GREEN" "$NC"
  ERROR_HANDLING_FOUND=true
fi

# Check for .catch() handlers
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
     --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
     -E '\.catch\(' -- "$PROJECT_ROOT" | grep -q .; then
  printf "  %b[PASS]%b Promise error handlers found\n" "$GREEN" "$NC"
  ERROR_HANDLING_FOUND=true
fi

if [[ "$ERROR_HANDLING_FOUND" == false ]]; then
  add_warning "Limited error handling detected. Add try/catch around AI calls."
fi

# ============================================================================
# CHECK 7: Token/cost tracking patterns
# ============================================================================

printf "[7/7] Checking token/cost tracking...\n"

TRACKING_FOUND=false

if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
     --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
     -E 'usage|tokens|cost.*track|track.*cost|inputTokens|outputTokens' -- "$PROJECT_ROOT" | grep -q .; then
  printf "  %b[PASS]%b Token/cost tracking patterns found\n" "$GREEN" "$NC"
  TRACKING_FOUND=true
fi

# Check for common tracking libraries
if [[ -f "$PROJECT_ROOT/package.json" ]]; then
  if grep -qE '@upstash/redis|redis|analytics' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b Tracking infrastructure found\n" "$GREEN" "$NC"
    TRACKING_FOUND=true
  fi
fi

if [[ "$TRACKING_FOUND" == false ]]; then
  add_warning "No token/cost tracking detected. Implement tracking to monitor spending."
fi

# ============================================================================
# RESULTS
# ============================================================================

printf "\n"
printf "%s\n" "-------------------------------------------------------"

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  if [[ ${#WARNINGS[@]} -eq 0 ]]; then
    printf "%b[PASS]%b - AI integration validated\n" "$GREEN" "$NC"
    printf "%s\n" "-------------------------------------------------------"
    exit 0
  else
    printf "%b[PASS]%b - AI integration validated (with warnings)\n" "$GREEN" "$NC"
    printf "\n"
    printf "%bWarnings:%b\n" "$YELLOW" "$NC"
    for i in "${!WARNINGS[@]}"; do
      printf "  %b%d:%b %s\n" "$YELLOW" "$((i + 1))" "$NC" "${WARNINGS[$i]}"
    done
    printf "%s\n" "-------------------------------------------------------"
    exit 0
  fi
else
  printf "%b[FAIL]%b - %d violation(s) found:\n" "$RED" "$NC" "${#VIOLATIONS[@]}"
  printf "\n"
  for i in "${!VIOLATIONS[@]}"; do
    printf "  %b%d:%b %s\n" "$RED" "$((i + 1))" "$NC" "${VIOLATIONS[$i]}"
  done
  
  if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    printf "\n"
    printf "%bWarnings:%b\n" "$YELLOW" "$NC"
    for i in "${!WARNINGS[@]}"; do
      printf "  %b%d:%b %s\n" "$YELLOW" "$((i + 1))" "$NC" "${WARNINGS[$i]}"
    done
  fi
  
  printf "%s\n" "-------------------------------------------------------"
  exit 1
fi
