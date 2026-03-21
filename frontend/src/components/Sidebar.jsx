// NAV_ITEMS defines every possible page. The Sidebar filters this list
// against enabledNavIds (from /api/apps) so disabled apps are hidden.

const ALL_NAV_ITEMS = [
  { id:"home",     icon:"⌂",  label:"Home",     alwaysShow:true },
  { id:"chat",     icon:"◈",  label:"Chat",      alwaysShow:true, badge:"AI" },
  { id:"news",     icon:"◉",  label:"Briefing",  alwaysShow:false },
  { id:"convs",    icon:"◫",  label:"History",   alwaysShow:true },
  { id:"stats",    icon:"◷",  label:"Stats",     alwaysShow:true },
  { id:"memory",   icon:"◎",  label:"Memory",    alwaysShow:true },
  { id:"fitness",  icon:"♦",  label:"Fitness",   alwaysShow:false },
  { id:"remind",   icon:"◌",  label:"Reminders", alwaysShow:false },
  { id:"calendar",  icon:"◫",  label:"Calendar",  alwaysShow:false },
  { id:"projects", icon:"◧",  label:"Projects",  alwaysShow:false },
  { id:"journal",  icon:"◩",  label:"Journal",   alwaysShow:false },
  { id:"calendar", icon:"◰",  label:"Calendar",  alwaysShow:false },
  { id:"profile",  icon:"◐",  label:"Profile",   alwaysShow:true },
  { id:"settings", icon:"⚙",  label:"Settings",  alwaysShow:true },
  { id:"models",   icon:"◑",  label:"Models",    alwaysShow:true },
];

function Sidebar({ activePage, onNavigate, onLock, hasActiveDownloads, enabledNavIds }) {
  const today = new Date().toLocaleDateString("en-GB", { weekday:"short", day:"numeric", month:"short" });

  // Show item if it always shows OR if its nav_id is in the enabled set
  const visibleItems = ALL_NAV_ITEMS.filter(item =>
    item.alwaysShow || !enabledNavIds || enabledNavIds.has(item.id)
  );

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
        {visibleItems.map((item, i) => (
          <div
            key={item.id}
            className={`nav-item${activePage === item.id ? " active" : ""}`}
            onClick={() => onNavigate(item.id)}
            style={{ animation:`slideInLeft 0.25s ease ${i * 0.03}s both` }}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.badge && <span className="nav-badge">{item.badge}</span>}
            {item.id === "models" && hasActiveDownloads && (
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
