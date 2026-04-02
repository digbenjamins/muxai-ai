#!/usr/bin/env bash
set -e

BOLD="\033[1m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}  muxAI - Update Script${RESET}"
echo -e "  -------------------------------------"
echo ""

# --- Pull latest --------------------------------------------------------------

echo -e "${BOLD}Pulling latest changes...${RESET}"
git pull
echo ""

# --- Install deps -------------------------------------------------------------

echo -e "${BOLD}Installing dependencies...${RESET}"
pnpm install
echo ""

# --- Build --------------------------------------------------------------------

echo -e "${BOLD}Building API...${RESET}"
pnpm --filter @muxai/api build
echo ""

echo -e "${BOLD}Building web app...${RESET}"
pnpm --filter @muxai/web build
echo ""

# --- Restart ------------------------------------------------------------------

if command -v pm2 &>/dev/null && [ -f ecosystem.config.js ]; then
  # Check if PM2 has muxai processes running
  if pm2 jlist 2>/dev/null | grep -q '"name":"muxai-'; then
    echo -e "${BOLD}Restarting muxAI via PM2...${RESET}"
    pm2 restart ecosystem.config.js --update-env
    pm2 save
    echo ""
    echo -e "${BOLD}${GREEN}  muxAI updated and restarted!${RESET}"
    echo ""
    echo -e "  Portal:  ${CYAN}http://localhost:3000${RESET}"
    echo -e "  API:     ${CYAN}http://localhost:3001${RESET}"
    echo ""
    echo -e "  Run ${YELLOW}pm2 logs${RESET} to view output"
    echo ""
    exit 0
  fi
fi

echo ""
echo -e "${BOLD}${GREEN}  muxAI updated and rebuilt!${RESET}"
echo ""
echo -e "  Start:"
echo -e "    ${YELLOW}pnpm start${RESET}            Run API + web (production build)"
echo ""
echo -e "  Or for development:"
echo -e "    ${YELLOW}pnpm dev${RESET}              Run API + web with hot reload"
echo ""
