#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║                   JARVIS — UNINSTALLER v1.0                     ║
# ╚══════════════════════════════════════════════════════════════════╝
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'
C='\033[0;36m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

ok()      { echo -e "  ${G}✓${NC}  $*"; }
skip()    { echo -e "  ${DIM}–${NC}  $* (not found, skipping)"; }
warn()    { echo -e "  ${Y}⚠${NC}  $*"; }
section() { echo -e "\n${BOLD}${C}  ━━━  $*  ━━━${NC}\n"; }
nl()      { echo ""; }

spinner() {
  local pid=$1 msg="$2" frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏') i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  ${C}${frames[$i]}${NC}  %-55s" "$msg"; i=$(( (i+1) % 10 )); sleep 0.08
  done
  printf "\r%-65s\r" " "
}

clear
echo -e "${R}${BOLD}"
echo "   ██╗   ██╗███╗   ██╗██╗███╗   ██╗███████╗████████╗ █████╗ ██╗     ██╗"
echo "   ██║   ██║████╗  ██║██║████╗  ██║██╔════╝╚══██╔══╝██╔══██╗██║     ██║"
echo "   ██║   ██║██╔██╗ ██║██║██╔██╗ ██║███████╗   ██║   ███████║██║     ██║"
echo "   ██║   ██║██║╚██╗██║██║██║╚██╗██║╚════██║   ██║   ██╔══██║██║     ██║"
echo "   ╚██████╔╝██║ ╚████║██║██║ ╚████║███████║   ██║   ██║  ██║███████╗███████╗"
echo "    ╚═════╝ ╚═╝  ╚═══╝╚═╝╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝"
echo -e "${NC}"
echo -e "${DIM}   Jarvis — Uninstaller v1.0${NC}"
echo -e "${DIM}   ──────────────────────────${NC}"
nl

echo -e "  ${R}${BOLD}WARNING: This will remove:${NC}"
echo    "  • The Jarvis systemd service (if installed)"
echo -e "  • The ${BOLD}data/${NC} directory — ALL your conversations, memories, fitness data"
echo -e "  • The ${BOLD}venv/${NC} directory — Python virtual environment"
echo -e "  • The ${BOLD}config.json${NC} file"
echo    "  • Downloaded Ollama AI models (optional)"
echo    "  • Ollama itself (optional)"
nl
echo -e "  ${DIM}The project folder itself (${SCRIPT_DIR}) will NOT be deleted.${NC}"
echo -e "  ${DIM}Your code files (jarvis.py, server.py, etc.) are kept.${NC}"
nl

read -rp "  $(echo -e "${Y}Are you sure you want to uninstall? [yes/N]: ${NC}")" confirm
[[ "$confirm" != "yes" ]] && { echo -e "\n  Cancelled."; exit 0; }

# ═══════════════════════════════════════════════════════════════
section "1 / 5 — Systemd Service"
# ═══════════════════════════════════════════════════════════════
SVC="$HOME/.config/systemd/user/jarvis-dashboard.service"
if [[ -f "$SVC" ]]; then
  systemctl --user stop    jarvis-dashboard &>/dev/null || true
  systemctl --user disable jarvis-dashboard &>/dev/null || true
  rm -f "$SVC"
  systemctl --user daemon-reload &>/dev/null || true
  ok "Service stopped and removed"
else
  skip "Systemd service"
fi

# ═══════════════════════════════════════════════════════════════
section "2 / 5 — Data & Config"
# ═══════════════════════════════════════════════════════════════
if [[ -d "$SCRIPT_DIR/data" ]]; then
  (rm -rf "$SCRIPT_DIR/data") & spinner $! "Removing data/ directory..."; wait
  ok "data/ removed (all databases, memories, encryption keys)"
else
  skip "data/ directory"
fi

[[ -f "$SCRIPT_DIR/config.json" ]] && { rm -f "$SCRIPT_DIR/config.json"; ok "config.json removed"; } || skip "config.json"

if [[ -d "$SCRIPT_DIR/venv" ]]; then
  (rm -rf "$SCRIPT_DIR/venv") & spinner $! "Removing Python virtual environment..."; wait
  ok "venv/ removed"
else
  skip "venv/ directory"
fi

for f in start-dashboard.sh start-terminal.sh; do
  [[ -f "$SCRIPT_DIR/$f" ]] && { rm -f "$SCRIPT_DIR/$f"; ok "Removed: $f"; } || skip "$f"
done

# ═══════════════════════════════════════════════════════════════
section "3 / 5 — pip Cache"
# ═══════════════════════════════════════════════════════════════
for d in "$HOME/.cache/pip" "$HOME/.cache/chroma" "$HOME/.cache/huggingface" "$HOME/.cache/torch"; do
  if [[ -d "$d" ]]; then
    (rm -rf "$d") & spinner $! "Removing $(basename $d) cache..."; wait; ok "Removed: $d"
  else
    skip "$d"
  fi
done

# ═══════════════════════════════════════════════════════════════
section "4 / 5 — Ollama Models (optional)"
# ═══════════════════════════════════════════════════════════════
nl
read -rp "  Remove downloaded Ollama models? This frees ~25 GB. [y/N]: " yn
if [[ "${yn,,}" == "y" ]]; then
  if command -v ollama &>/dev/null && curl -sf http://localhost:11434/api/tags &>/dev/null; then
    MLIST=$(ollama list 2>/dev/null | tail -n +2 | awk '{print $1}' || true)
    if [[ -n "$MLIST" ]]; then
      while IFS= read -r model; do
        [[ -z "$model" ]] && continue
        ollama rm "$model" &>/dev/null && ok "Removed model: $model" || warn "Could not remove: $model"
      done <<< "$MLIST"
    else
      skip "No models found"
    fi
  else
    warn "Ollama not running — remove models manually with: ollama rm <name>"
  fi
else
  skip "Ollama models (skipped by user)"
fi

# ═══════════════════════════════════════════════════════════════
section "5 / 5 — Ollama (optional)"
# ═══════════════════════════════════════════════════════════════
nl
read -rp "  Remove Ollama completely? [y/N]: " yn
if [[ "${yn,,}" == "y" ]]; then
  sudo systemctl stop    ollama &>/dev/null || true
  sudo systemctl disable ollama &>/dev/null || true
  if command -v ollama &>/dev/null; then
    sudo rm -f "$(which ollama)"
    ok "Ollama binary removed"
  fi
  [[ -d "$HOME/.ollama" ]] && { (rm -rf "$HOME/.ollama") & spinner $! "Removing ~/.ollama..."; wait; ok "~/.ollama removed"; }
  sudo rm -f /etc/systemd/system/ollama.service &>/dev/null || true
  sudo systemctl daemon-reload &>/dev/null || true
  ok "Ollama removed"
else
  skip "Ollama (skipped by user)"
fi

# ═══════════════════════════════════════════════════════════════
nl
echo -e "${G}${BOLD}  ╔══════════════════════════════════════╗${NC}"
echo -e "${G}${BOLD}  ║   Uninstall complete  ✓              ║${NC}"
echo -e "${G}${BOLD}  ╚══════════════════════════════════════╝${NC}"
nl
echo -e "  ${DIM}Project files (*.py, *.html, *.md, *.sh, *.txt) were kept.${NC}"
echo -e "  ${DIM}Run install.sh again to reinstall from scratch.${NC}"
nl

# Verify
echo -e "  ${BOLD}Verification:${NC}"
[[ -d "$SCRIPT_DIR/data"   ]] && warn "data/ still exists" || ok "data/ gone"
[[ -d "$SCRIPT_DIR/venv"   ]] && warn "venv/ still exists" || ok "venv/ gone"
[[ -f "$SCRIPT_DIR/config.json" ]] && warn "config.json still exists" || ok "config.json gone"
nl
