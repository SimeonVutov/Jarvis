#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║                    JARVIS — INSTALLER v1.0                      ║
# ╚══════════════════════════════════════════════════════════════════╝
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colours ──────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'
C='\033[0;36m'; W='\033[1;37m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "  ${DIM}[$(date +%H:%M:%S)]${NC} $*"; }
ok()      { echo -e "  ${G}✓${NC}  $*"; }
warn()    { echo -e "  ${Y}⚠${NC}  $*"; }
fail()    { echo -e "\n  ${R}✗  ERROR:${NC} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}${C}  ━━━  $*  ━━━${NC}\n"; }
nl()      { echo ""; }

spinner() {
  local pid=$1 msg="$2"
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏') i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  ${C}${frames[$i]}${NC}  %-55s" "$msg"
    i=$(( (i+1) % 10 )); sleep 0.08
  done
  printf "\r%-65s\r" " "
}

pbar() {
  local cur=$1 tot=$2 lbl="$3" w=36
  local filled=$(( cur * w / tot )) pct=$(( cur * 100 / tot )) bar="" i
  for ((i=0;i<filled;i++));  do bar+="█"; done
  for ((i=filled;i<w;i++)); do bar+="░"; done
  printf "\r  ${C}[${bar}]${NC} ${BOLD}%3d%%${NC}  %-30s" "$pct" "$lbl"
}

banner() {
  clear
  echo -e "${C}${BOLD}"
  echo "    ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗"
  echo "    ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝"
  echo "    ██║███████║██████╔╝╚██╗ ██╔╝██║███████╗"
  echo "    ██║██╔══██║██╔══██╗ ╚████╔╝ ██║╚════██║"
  echo "    ╚═╝██║  ██║██║  ██║  ╚══╝  ██║███████║"
  echo "       ╚═╝  ╚═╝╚═╝  ╚═╝        ╚═╝╚══════╝"
  echo -e "${NC}${DIM}    Personal AI Assistant — Installer v1.0${NC}"
  echo -e "${DIM}    ─────────────────────────────────────────${NC}\n"
}

# ═══════════════════════════════════════════════════════════════
# MODEL CATALOGUE
# ═══════════════════════════════════════════════════════════════
STUDY_MODELS=("deepseek-r1:7b" "deepseek-r1:14b" "llama3.1:8b" "gemma2:9b" "mistral:7b-instruct")
STUDY_DESC=(
  "DeepSeek R1 7B      — chain-of-thought reasoning, great for complex concepts (5 GB)"
  "DeepSeek R1 14B     — deeper reasoning, best results for study (9 GB) *"
  "Llama 3.1 8B        — solid all-round, good at explanations (5 GB)"
  "Gemma 2 9B          — Google model, strong analytical reasoning (5.5 GB)"
  "Mistral 7B Instruct — fast and concise (4.5 GB)"
)
CODING_MODELS=("qwen2.5-coder:7b" "qwen2.5-coder:14b" "codellama:7b" "deepseek-coder-v2:16b-lite-instruct")
CODING_DESC=(
  "Qwen 2.5 Coder 7B    — best 7B coder, excellent embedded C + web dev (4.5 GB)"
  "Qwen 2.5 Coder 14B   — stronger, bare-metal and full-stack projects (9 GB) *"
  "Code Llama 7B         — Meta's dedicated code model (4.5 GB)"
  "DeepSeek Coder V2 16B — top-tier for systems programming (10 GB) *"
)
GENERAL_MODELS=("llama3.1:8b" "llama3.2:3b" "mistral:7b-instruct" "gemma2:9b" "qwen2.5:7b")
GENERAL_DESC=(
  "Llama 3.1 8B        — best general choice, natural conversation (5 GB)"
  "Llama 3.2 3B        — very fast, lightweight (2 GB)"
  "Mistral 7B Instruct — sharp and concise (4.5 GB)"
  "Gemma 2 9B          — strong reasoning (5.5 GB)"
  "Qwen 2.5 7B         — multilingual capable (5 GB)"
)

pick_model() {
  local title="$1" result_var="$2"
  shift 2
  local -a models=("$@")
  # descs are passed after models via global arrays
  nl
  echo -e "  ${BOLD}${W}Select model for ${C}${title}${W} mode${NC}"
  echo -e "  ${DIM}  * = may use CPU offload on GPUs with < 10 GB VRAM (still works)${NC}"
  nl
  case "$title" in
    STUDY*)   descs=("${STUDY_DESC[@]}") ;;
    CODING*)  descs=("${CODING_DESC[@]}") ;;
    GENERAL*) descs=("${GENERAL_DESC[@]}") ;;
  esac
  for i in "${!models[@]}"; do
    printf "  ${C}[%d]${NC}  %s\n" "$((i+1))" "${descs[$i]:-${models[$i]}}"
  done
  nl
  while true; do
    read -rp "  Choice [1-${#models[@]}]: " ch
    if [[ "$ch" =~ ^[0-9]+$ ]] && (( ch>=1 && ch<=${#models[@]} )); then
      eval "$result_var='${models[$((ch-1))]}'"
      eval "ok \"Selected: \$$result_var\""
      break
    fi
    warn "Invalid — enter 1 to ${#models[@]}"
  done
}

# ═══════════════════════════════════════════════════════════════
# NEWS SOURCE CATALOGUE
# format: "id|display name|country|rss_url"
# ═══════════════════════════════════════════════════════════════
ALL_SOURCES=(
  "bbc_world|BBC World News|World|https://feeds.bbci.co.uk/news/world/rss.xml"
  "reuters|Reuters Top News|World|https://feeds.reuters.com/reuters/topNews"
  "aljazeera|Al Jazeera English|World|https://www.aljazeera.com/xml/rss/all.xml"
  "guardian|The Guardian World|World|https://www.theguardian.com/world/rss"
  "ap_news|AP News|World|https://rsshub.app/apnews/topics/apf-topnews"
  "nltimes|NL Times|Netherlands|https://nltimes.nl/rss.xml"
  "dutchnews|DutchNews.nl|Netherlands|https://www.dutchnews.nl/feed/"
  "nos_nl|NOS Nieuws|Netherlands|https://feeds.nos.nl/nosnieuwsalgemeen"
  "dir_bg|Dir.bg|Bulgaria|https://www.dir.bg/rss/"
  "dnes_bg|Dnes.bg|Bulgaria|https://dnes.bg/rss.xml"
  "24chasa|24 Chasa|Bulgaria|https://www.24chasa.bg/rss"
  "mediapool|Mediapool.bg|Bulgaria|https://mediapool.bg/rss/all.rss"
  "offnews|Offnews.bg|Bulgaria|https://offnews.bg/rss"
  "bird_bg|Bird.bg|Bulgaria|https://bird.bg/feed/"
  "svobodna|Svobodna Evropa (BG)|Bulgaria|https://www.svobodnaevropa.bg/api/zrqotlymit"
  "bnr|BNR Radio Bulgaria|Bulgaria|https://bnr.bg/radiobulgaria/rss"
  "bta|BTA News Agency|Bulgaria|https://www.bta.bg/rss/Bulgaria.xml"
  "bbc_tech|BBC Technology|Tech|https://feeds.bbci.co.uk/news/technology/rss.xml"
  "hackernews|Hacker News|Tech|https://news.ycombinator.com/rss"
  "arstechnica|Ars Technica|Tech|https://feeds.arstechnica.com/arstechnica/index"
)

ENABLED_JSON=()

pick_news() {
  nl
  echo -e "  ${BOLD}${W}Configure news sources${NC}"
  echo -e "  ${DIM}Choose which sources to include. Changeable later in the dashboard.${NC}"
  declare -A grouped
  for s in "${ALL_SOURCES[@]}"; do
    IFS='|' read -r id name country url <<< "$s"
    grouped["$country"]+="$s\n"
  done
  for country in "World" "Netherlands" "Bulgaria" "Tech"; do
    [[ -z "${grouped[$country]:-}" ]] && continue
    nl; echo -e "  ${C}── ${BOLD}${country}${NC}${C} ──${NC}"
    while IFS= read -r s; do
      [[ -z "$s" ]] && continue
      IFS='|' read -r id name c url <<< "$s"
      printf "  Include %-30s? [Y/n]: " "$name"
      
      read -r yn </dev/tty 
      
      if [[ "${yn,,}" != "n" ]]; then
        local escaped_url="${url//\"/\\\"}"
        ENABLED_JSON+=("{\"id\":\"${id}\",\"name\":\"${name}\",\"country\":\"${country}\",\"url\":\"${escaped_url}\",\"enabled\":true}")
        ok "$name"
      fi
    done <<< "$(printf '%b' "${grouped[$country]}")"
  done
}

# ═══════════════════════════════════════════════════════════════
banner
# ═══════════════════════════════════════════════════════════════

echo -e "  ${BOLD}What this installer does:${NC}"
echo    "  • Installs system packages via pacman"
echo    "  • Installs CUDA and verifies NVIDIA drivers"
echo    "  • Installs Ollama"
echo    "  • Lets you pick AI models (study / coding / general)"
echo    "  • Downloads those models"
echo    "  • Creates your user profile"
echo    "  • Configures news sources"
echo    "  • Sets up Python venv and installs requirements.txt"
echo -e "  • Writes ${C}config.json${NC} in this directory\n"
echo -e "  ${DIM}Everything is stored in: ${BOLD}${SCRIPT_DIR}/${NC}"
echo -e "  ${DIM}Nothing is written to ~/.config or system paths (except optional systemd service).${NC}\n"
read -rp "  Start installation? [Y/n]: " yn
[[ "${yn,,}" == "n" ]] && { echo "  Cancelled."; exit 0; }
[[ $EUID -eq 0 ]] && fail "Run as your normal user, not root."

# ═══════════════════════════════════════════════════════════════
section "1 / 8 — System Packages"
# ═══════════════════════════════════════════════════════════════
PKGS=(python python-pip git curl base-devel)
MISS=()
for p in "${PKGS[@]}"; do pacman -Q "$p" &>/dev/null || MISS+=("$p"); done
if [[ ${#MISS[@]} -gt 0 ]]; then
  log "Installing missing packages: ${MISS[*]}"
  (sudo pacman -S --noconfirm --needed "${MISS[@]}" 2>/dev/null) &
  spinner $! "Installing system packages..."; wait
fi
ok "System packages ready"

log "Checking CUDA..."
if ! pacman -Q cuda &>/dev/null; then
  (sudo pacman -S --noconfirm --needed cuda 2>/dev/null) &
  spinner $! "Installing CUDA..."; wait; ok "CUDA installed"
else
  ok "CUDA already installed ($(pacman -Q cuda | awk '{print $2}'))"
fi

if command -v nvidia-smi &>/dev/null; then
  GPU=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "Unknown")
  VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader 2>/dev/null | head -1 || echo "?")
  ok "GPU detected: $GPU ($VRAM)"
else
  warn "nvidia-smi not found — install NVIDIA drivers: sudo pacman -S nvidia-open nvidia-utils"
fi

# ═══════════════════════════════════════════════════════════════
section "2 / 8 — Ollama"
# ═══════════════════════════════════════════════════════════════
if ! command -v ollama &>/dev/null; then
  (curl -fsSL https://ollama.com/install.sh | sh 2>/dev/null) &
  spinner $! "Installing Ollama..."; wait; ok "Ollama installed"
else
  ok "Ollama already installed"
fi

sudo systemctl enable --now ollama &>/dev/null || true
printf "\n  Waiting for Ollama API"
for i in {1..20}; do
  curl -sf http://localhost:11434/api/tags &>/dev/null && { echo ""; ok "Ollama API ready"; break; }
  printf "."; sleep 1
  [[ $i -eq 20 ]] && fail "Ollama API not responding. Run: sudo systemctl start ollama"
done

# ═══════════════════════════════════════════════════════════════
section "3 / 8 — Model Selection"
# ═══════════════════════════════════════════════════════════════
MODEL_STUDY=""
MODEL_CODING=""
MODEL_GENERAL=""
MODEL_EMBED="nomic-embed-text"

pick_model "STUDY   (reasoning, science, math)"  MODEL_STUDY   "${STUDY_MODELS[@]}"
pick_model "CODING  (systems C, embedded, web)"  MODEL_CODING  "${CODING_MODELS[@]}"
pick_model "GENERAL (everyday conversation)"     MODEL_GENERAL "${GENERAL_MODELS[@]}"

nl
echo -e "  ${BOLD}Your selection:${NC}"
printf "  ${C}study${NC}   → %s\n" "$MODEL_STUDY"
printf "  ${C}coding${NC}  → %s\n" "$MODEL_CODING"
printf "  ${C}general${NC} → %s\n" "$MODEL_GENERAL"
printf "  ${C}embed${NC}   → %s  (memory system, always required)\n" "$MODEL_EMBED"
nl; read -rp "  Download these now? [Y/n]: " yn
[[ "${yn,,}" == "n" ]] && fail "Aborted at model download."

# ═══════════════════════════════════════════════════════════════
section "4 / 8 — Downloading Models"
# ═══════════════════════════════════════════════════════════════
pull_one() {
  local name="$1"
  if ollama list 2>/dev/null | grep -q "^${name}"; then
    ok "$name — already downloaded, skipping"; return
  fi
  log "Pulling $name (may take several minutes)..."
  ollama pull "$name" 2>&1 | while IFS= read -r line; do
    printf "\r  ${C}↓${NC}  %-62s" "$line"
  done
  printf "\r%-70s\r" " "; ok "Downloaded: $name"
}
pull_one "$MODEL_STUDY"
pull_one "$MODEL_CODING"
pull_one "$MODEL_GENERAL"
pull_one "$MODEL_EMBED"
nl; ok "All models ready"

# ═══════════════════════════════════════════════════════════════
section "5 / 8 — User Profile"
# ═══════════════════════════════════════════════════════════════
echo -e "  ${BOLD}Set up your profile.${NC}"
echo -e "  ${DIM}This is injected into every AI conversation automatically — the assistant will${NC}"
echo -e "  ${DIM}always know who you are without you needing to repeat yourself.${NC}"
echo -e "  ${DIM}You can update this anytime via the dashboard Profile page.${NC}"
nl

read -rp "  Your name: " USER_NAME; [[ -z "$USER_NAME" ]] && USER_NAME="User"
read -rp "  Your city (for weather, e.g. Amsterdam): " USER_CITY; [[ -z "$USER_CITY" ]] && USER_CITY="Amsterdam"
read -rp "  Timezone (e.g. Europe/Amsterdam): " USER_TZ; [[ -z "$USER_TZ" ]] && USER_TZ="Europe/Amsterdam"

nl
echo -e "  ${BOLD}Write a brief about yourself${NC} ${DIM}(end input with a blank line):${NC}"
echo -e "  ${DIM}Include: what you do or study, relevant background, habits, anything the${NC}"
echo -e "  ${DIM}AI should factor into its responses. Be as detailed as you like.${NC}"
echo -e ""
echo -e "  ${C}Example:${NC} ${DIM}I am a software engineer at a fintech startup. I work mainly in Python${NC}"
echo -e "  ${DIM}and Go. I follow a low-carb diet and train 4 days a week. I prefer concise${NC}"
echo -e "  ${DIM}direct answers. I am based in Amsterdam and speak English and Dutch.${NC}"
nl

USER_BRIEF=""
while IFS= read -r line; do
  [[ -z "$line" && -n "$USER_BRIEF" ]] && break
  [[ -n "$line" ]] && USER_BRIEF+="${line} "
done
USER_BRIEF="${USER_BRIEF% }"
[[ -z "$USER_BRIEF" ]] && USER_BRIEF="A user of the Jarvis personal AI assistant."
ok "Profile saved for: $USER_NAME"

# ═══════════════════════════════════════════════════════════════
section "6 / 8 — News Sources"
# ═══════════════════════════════════════════════════════════════
pick_news

# ═══════════════════════════════════════════════════════════════
section "7 / 8 — Python Environment"
# ═══════════════════════════════════════════════════════════════
VENV="$SCRIPT_DIR/venv"
if [[ ! -d "$VENV" ]]; then
  (python -m venv "$VENV" 2>/dev/null) & spinner $! "Creating venv..."; wait
fi
ok "venv ready: $VENV"

($VENV/bin/pip install --upgrade pip -q 2>/dev/null) & spinner $! "Upgrading pip..."; wait

REQS=()
while IFS= read -r line; do
  [[ -z "$line" || "$line" =~ ^# ]] && continue; REQS+=("$line")
done < "$SCRIPT_DIR/requirements.txt"
TOTAL=${#REQS[@]}; DONE=0
for pkg in "${REQS[@]}"; do
  DONE=$((DONE+1)); pbar "$DONE" "$TOTAL" "$pkg"
  $VENV/bin/pip install "$pkg" -q 2>/dev/null || warn "Failed: $pkg"
done
printf "\r%-70s\r" " "; ok "Python deps installed ($TOTAL packages)"

# ═══════════════════════════════════════════════════════════════
section "8 / 8 — Writing Config & Scripts"
# ═══════════════════════════════════════════════════════════════
mkdir -p "$SCRIPT_DIR/data"

# Build news JSON
NEWS_ARR="["
SEP=""
for entry in "${ENABLED_JSON[@]}"; do
  NEWS_ARR+="${SEP}${entry}"; SEP=","
done
NEWS_ARR+="]"

# Escape brief for JSON
BRIEF_ESC="${USER_BRIEF//\\/\\\\}"; BRIEF_ESC="${BRIEF_ESC//\"/\\\"}"

cat > "$SCRIPT_DIR/config.json" << CFGEOF
{
  "_note": "Generated by install.sh — edit manually or via the dashboard Profile page",
  "models": {
    "study":   "${MODEL_STUDY}",
    "coding":  "${MODEL_CODING}",
    "general": "${MODEL_GENERAL}",
    "embed":   "${MODEL_EMBED}"
  },
  "user": {
    "name":     "${USER_NAME}",
    "brief":    "${BRIEF_ESC}",
    "city":     "${USER_CITY}",
    "timezone": "${USER_TZ}"
  },
  "news": {
    "sources": ${NEWS_ARR}
  },
  "server": {
    "host": "127.0.0.1",
    "port": 7777
  },
  "data_dir": "data"
}
CFGEOF
ok "config.json written"

# Launch scripts
cat > "$SCRIPT_DIR/start-dashboard.sh" << 'SH'
#!/usr/bin/env bash
# Jarvis — Start the web dashboard
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -d "$DIR/venv" ]]; then echo "ERROR: venv not found. Run install.sh first."; exit 1; fi
if [[ ! -f "$DIR/config.json" ]]; then echo "ERROR: config.json not found. Run install.sh first."; exit 1; fi
source "$DIR/venv/bin/activate"
cd "$DIR"
echo "  Jarvis dashboard starting…"
echo "  Open http://localhost:7777 in your browser"
echo "  Press Ctrl+C to stop"
echo ""
# server.py imports from backend/ — project root must be the working directory
python "$DIR/server.py"
SH

cat > "$SCRIPT_DIR/start-terminal.sh" << 'SH'
#!/usr/bin/env bash
# Jarvis — Start the terminal interface
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -d "$DIR/venv" ]]; then echo "ERROR: venv not found. Run install.sh first."; exit 1; fi
if [[ ! -f "$DIR/config.json" ]]; then echo "ERROR: config.json not found. Run install.sh first."; exit 1; fi
source "$DIR/venv/bin/activate"
cd "$DIR"
python "$DIR/jarvis.py"
SH

chmod +x "$SCRIPT_DIR/start-dashboard.sh" "$SCRIPT_DIR/start-terminal.sh"
ok "start-dashboard.sh and start-terminal.sh created"

# Optional systemd service
nl; read -rp "  Install dashboard as systemd user service (auto-start on login)? [Y/n]: " yn
if [[ "${yn,,}" != "n" ]]; then
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/jarvis-dashboard.service" << SVCEOF
[Unit]
Description=Jarvis Dashboard
After=network.target ollama.service

[Service]
ExecStart=/bin/bash ${SCRIPT_DIR}/start-dashboard.sh
WorkingDirectory=${SCRIPT_DIR}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
SVCEOF
  systemctl --user daemon-reload
  systemctl --user enable --now jarvis-dashboard &>/dev/null \
    && ok "Systemd service enabled and started" \
    || { ok "Service enabled"; warn "Start with: systemctl --user start jarvis-dashboard"; }
fi

# Done
nl
echo -e "${BOLD}${G}  ╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${G}  ║   Installation complete!  ✓               ║${NC}"
echo -e "${BOLD}${G}  ╚═══════════════════════════════════════════╝${NC}"
nl
echo -e "  ${BOLD}Start dashboard:${NC}  bash start-dashboard.sh"
echo -e "  ${BOLD}Open browser:${NC}     http://localhost:7777"
echo -e "  ${BOLD}Start terminal:${NC}   bash start-terminal.sh"
nl
echo -e "  ${Y}First launch: you will be prompted to set an encryption password.${NC}"
echo -e "  ${Y}Write it down — there is no recovery mechanism.${NC}"
nl
echo -e "  ${BOLD}Config:${NC}  ${SCRIPT_DIR}/config.json"
echo -e "  ${BOLD}Data:${NC}    ${SCRIPT_DIR}/data/"
nl
