# Jarvis — Local AI Personal Assistant

A fully local, encrypted personal AI assistant with a React dashboard and terminal interface. All data is stored inside the project folder — nothing is written to system paths. No cloud, no telemetry, no API keys.

---

## What it is

Jarvis is a self-hosted AI assistant that runs entirely on your machine using [Ollama](https://ollama.com). It maintains a long-term memory of your conversations using ChromaDB and SQLite, automatically selects the right AI model based on what you are talking about (study, coding, or general), and presents everything through a web dashboard or a terminal interface.

Key properties:
- All data encrypted at rest with AES-256-GCM, key derived from your password via PBKDF2-SHA256 (600k iterations)
- Nothing stored outside the project directory
- Three AI models running locally — one for study/reasoning, one for coding, one for general chat
- Web search via DuckDuckGo (no API key, results not stored)
- News briefing from configurable RSS sources including Bulgarian, Dutch, and international feeds
- Fitness and nutrition tracking with calorie and weight graphs
- Reminders fed into AI context so it never hallucinates upcoming events
- User profile injected into every conversation — the AI always knows your context

---

## Screenshots

| Lock screen | Home | Chat |
|---|---|---|
| ![Lock](docs/screenshots/lock.png) | ![Home](docs/screenshots/home.png) | ![Chat](docs/screenshots/chat.png) |

| Fitness | Models | Profile |
|---|---|---|
| ![Fitness](docs/screenshots/fitness.png) | ![Models](docs/screenshots/models.png) | ![Profile](docs/screenshots/profile.png) |

---

## Technologies

| Layer | Technology |
|---|---|
| AI inference | [Ollama](https://ollama.com) — local model runner |
| Vector memory | [ChromaDB](https://www.trychroma.com) + nomic-embed-text |
| Structured memory | SQLite (WAL mode) |
| Encryption | AES-256-GCM via Python `cryptography` library |
| Backend API | FastAPI + Uvicorn |
| Frontend | React 18 (CDN, no build step), marked.js for markdown |
| Terminal UI | Rich + prompt_toolkit |
| Web search | DuckDuckGo Search (no API key) |
| News | feedparser over RSS/Atom |
| Weather | wttr.in (no API key) |
| GPU acceleration | CUDA via Ollama's built-in CUDA support |

---

## Tested hardware

| Component | Spec |
|---|---|
| GPU | NVIDIA RTX 4070 Laptop — 8 GB VRAM |
| CPU | AMD Ryzen 9 7000 series |
| RAM | 32 GB |
| OS | Arch Linux (kernel 6.x) |
| CUDA | 12.x |

Models marked `*` in the installer (14B+) will partially offload to RAM on 8 GB VRAM. They still work — Ollama handles the split automatically. Expect ~15 tokens/sec instead of ~25-30 for pure GPU runs.

---

## Requirements

### System
- Arch Linux (or any systemd-based distro with pacman)
- Python 3.11+
- NVIDIA GPU with valid drivers (`nvidia-open` or `nvidia`)
- CUDA toolkit
- Ollama

### Python (installed automatically from `requirements.txt`)
```
ollama
chromadb
fastapi
uvicorn[standard]
httpx
feedparser
pydantic
rich
prompt_toolkit
cryptography
duckduckgo-search
```

---

## Installation

### 1. Clone the repository
```bash
git clone https://github.com/your-username/jarvis.git
cd jarvis
```

### 2. Install NVIDIA drivers (if not already installed)
```bash
sudo pacman -S nvidia-open nvidia-utils
sudo reboot
```
Verify:
```bash
nvidia-smi
```

### 3. Install CUDA
```bash
sudo pacman -S cuda
```

### 4. Run the installer
```bash
bash install.sh
```

The installer will:
- Install system packages via `pacman` (`python`, `python-pip`, `git`, `curl`, `base-devel`, `cuda`)
- Download and install Ollama from the official installer script
- Present a numbered menu to choose models for **study**, **coding**, and **general** modes
- Download those models from Ollama's library
- Ask for your name, city, timezone, and a personal brief
- Ask which news sources to enable (World, Netherlands, Bulgaria, Tech)
- Create a Python virtual environment at `venv/`
- Install all Python dependencies from `requirements.txt`
- Write `config.json` in the project root
- Create `start-dashboard.sh` and `start-terminal.sh`
- Optionally install a systemd user service for the dashboard

**First launch:** you will be prompted to set an encryption password. This password encrypts your entire database. Write it down — there is no recovery.

---

## Starting Jarvis

### Dashboard (recommended)
```bash
bash start-dashboard.sh
```
Then open [http://localhost:7777](http://localhost:7777) in your browser.

### Terminal interface
```bash
bash start-terminal.sh
```

### As a background service (if you chose systemd during install)
```bash
systemctl --user start jarvis-dashboard
systemctl --user status jarvis-dashboard
```

---

## Uninstall

```bash
bash uninstall.sh
```

The uninstaller will:
- Stop and remove the systemd service
- Remove `data/` (all databases, memories, encryption keys)
- Remove `venv/` and `config.json`
- Optionally remove Ollama models (~25 GB)
- Optionally remove Ollama entirely

Project files (`*.py`, `*.html`, `*.md`, `*.sh`) are kept. Run `install.sh` again to reinstall from scratch.

---

## Update

To update the project files (code only, your data is untouched):
```bash
git pull
```

If `requirements.txt` changed:
```bash
source venv/bin/activate
pip install -r requirements.txt
```

If you want to change which AI models are used, edit `config.json` directly:
```json
{
  "models": {
    "study":   "deepseek-r1:14b",
    "coding":  "qwen2.5-coder:14b",
    "general": "llama3.1:8b",
    "embed":   "nomic-embed-text"
  }
}
```
Then pull the new model:
```bash
ollama pull deepseek-r1:14b
```
And restart the server.

---

## Usage

### Dashboard
Navigate to [http://localhost:7777](http://localhost:7777) after starting the server.

| Page | What it does |
|---|---|
| **Chat** | Full AI chat with streaming responses, markdown rendering, session history, auto mode detection |
| **Home** | Daily greeting, weather, upcoming reminders, recent journal |
| **Briefing** | News from your configured RSS sources grouped by country |
| **Fitness** | Log calories, weight, workouts. Calorie and weight graphs for last week / month / year |
| **Reminders** | Add and manage reminders. Upcoming events are fed into AI context to prevent hallucinations |
| **Profile** | Edit your name, brief, city, timezone. Toggle news sources on/off |
| **History** | Browse and re-read past conversations |
| **Memory** | Search and delete stored memories |
| **Stats** | Message counts, usage by mode, configured models |
| **Models** | Pull new Ollama models, remove existing ones |

### Terminal commands
Inside `bash start-terminal.sh`:

```
/journal <text>                  Save an encrypted journal entry
/fitness <kcal> [weight] [name]  Log today's fitness, e.g. /fitness 2100 75.5 chest
/recall <topic>                  Semantic memory search
/reminders                       Show upcoming reminders
/remind <title> | <YYYY-MM-DD>   Add a reminder
/search <query>                  Manual web search (not stored)
/session                         List recent sessions
/session <id>                    Continue a past session
/mode <study|coding|general>     Force a mode
/profile                         Show your current profile
/clear                           Clear screen
/quit                            Exit
```

### AI mode auto-detection
Jarvis automatically switches models mid-conversation based on keywords:

- **Study mode** → triggered by: exam, lecture, OS, scheduler, virtual memory, physics, math, calculus, compiler, network, TCP…
- **Coding mode** → triggered by: code, debug, function, C, C++, embedded, firmware, GPIO, UART, HTML, React…
- **General mode** → everything else

The mode switch is shown inline and does not interrupt the conversation.

---

## Project structure

```
jarvis/
├── install.sh              # Interactive installer
├── uninstall.sh            # Clean uninstaller
├── jarvis.py               # Terminal interface
├── server.py               # FastAPI backend
├── dashboard.html          # React frontend (single file, no build)
├── requirements.txt        # Python dependencies
├── config.json             # Generated by installer (gitignored)
├── config.template.json    # Template showing config structure
├── start-dashboard.sh      # Generated by installer
├── start-terminal.sh       # Generated by installer
├── venv/                   # Python virtual environment (gitignored)
├── data/                   # All runtime data (gitignored)
│   ├── jarvis.db           # SQLite database (encrypted)
│   ├── chroma/             # ChromaDB vector index
│   └── .salt               # PBKDF2 salt (never commit this)
└── docs/
    └── screenshots/        # Dashboard screenshots for README
```

---

## Security model

- Your password is never stored anywhere. It is used to derive a 256-bit AES key via PBKDF2-SHA256 with 600,000 iterations each session.
- The salt is stored in `data/.salt`. Without both the salt and your password, the database is unreadable.
- ChromaDB stores only SQLite row IDs as document strings — no plaintext ever enters the vector index.
- `prompt_toolkit` history is in-memory only — no `.history` file is written.
- Web search results are used for context only and are never persisted.
- `config.json`, `data/`, and `venv/` are all gitignored by default.

---

## Adding news sources manually

Edit `config.json` and add entries to `news.sources`:

```json
{
  "id": "my_source",
  "name": "My News Site",
  "country": "World",
  "url": "https://example.com/rss.xml",
  "enabled": true
}
```

Or use the Profile → News Sources toggle in the dashboard.

---

## License

MIT
