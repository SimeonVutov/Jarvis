const NAV_ITEMS = [
  { id: "home",     icon: "⌂",  label: "Home"        },
  { id: "chat",     icon: "◈",  label: "Chat",   badge: "AI" },
  { id: "news",     icon: "◉",  label: "Briefing"    },
  { id: "convs",    icon: "◫",  label: "History"     },
  { id: "stats",    icon: "◷",  label: "Stats"       },
  { id: "memory",   icon: "◎",  label: "Memory"      },
  { id: "fitness",  icon: "♦",  label: "Fitness"     },
  { id: "remind",   icon: "◌",  label: "Reminders"   },
  { id: "projects", icon: "◧",  label: "Projects"    },
  { id: "profile",  icon: "◐",  label: "Profile"     },
  { id: "models",   icon: "◑",  label: "Models"      },
];

function Sidebar({ activePage, onNavigate, onLock, hasActiveDownloads }) {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="logo">
          <div className="logo-mark">J</div>
          <div className="logo-text">JARVIS</div>
        </div>
        <div className="logo-date">{today}</div>
      </div>

      <nav className="nav">
        {NAV_ITEMS.map((item, i) => (
          <div
            key={item.id}
            className={`nav-item${activePage === item.id ? " active" : ""}`}
            onClick={() => onNavigate(item.id)}
            style={{ animation: `slideInLeft 0.25s ease ${i * 0.03}s both` }}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.badge && <span className="nav-badge">{item.badge}</span>}
            {item.id === "models" && hasActiveDownloads && !item.badge && (
              <span className="nav-dl-dot" title="Download in progress" />
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="enc-status">
          <div className="enc-dot" />
          <span>Encrypted</span>
        </div>
        <button className="lock-btn" onClick={onLock}>Lock</button>
      </div>
    </aside>
  );
}
