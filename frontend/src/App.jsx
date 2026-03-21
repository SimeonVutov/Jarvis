const { useState, useEffect, useRef } = React;

const PAGE_TITLES = {
  home:"Home", chat:"Chat", news:"Briefing", convs:"History",
  stats:"Stats", memory:"Memory", fitness:"Fitness", remind:"Reminders",
  projects:"Projects", journal:"Journal", profile:"Profile", models:"Models",
  calendar:"Calendar",
  settings:"Settings", calendar:"Calendar",
};

const FULL_HEIGHT_PAGES = new Set(["chat","convs","projects","calendar"]);

function App() {
  const [unlocked,          setUnlocked]          = useState(false);
  const [page,              setPage]               = useState("home");
  const [pageKey,           setPageKey]            = useState(0);
  const [hasActiveDownload, setHasActiveDownload]  = useState(false);
  // enabledApps: set of app ids currently enabled — drives sidebar visibility
  const [enabledApps,       setEnabledApps]        = useState(null);

  useEffect(() => {
    api("/api/status").then(d => { if (d.unlocked) setUnlocked(true); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    loadEnabledApps();
    api("/api/models/pull/all").then(data => {
      setHasActiveDownload(Object.values(data).some(v => v.status === "downloading" || v.status === "queued"));
    }).catch(() => {});
  }, [unlocked]);

  async function loadEnabledApps() {
    try {
      const apps = await api("/api/apps");
      setEnabledApps(new Set(apps.filter(a => a.enabled).map(a => a.nav_id)));
    } catch {
      // fallback: show all pages
      setEnabledApps(new Set(["home","chat","news","convs","stats","memory","fitness","remind","projects","journal","profile","models","settings"]));
    }
  }

  async function lock() {
    await jsonPost("/api/lock", {}).catch(() => {});
    setUnlocked(false);
  }

  function navigate(newPage) { setPage(newPage); setPageKey(k => k + 1); }
  function refresh()         { setPageKey(k => k + 1); }

  if (!unlocked) return <LockScreen onUnlock={() => setUnlocked(true)} />;
  // Wait for app list before rendering so sidebar doesn't flash
  if (!enabledApps) return <div className="page-loading"><Spinner /></div>;

  const now  = new Date();
  const time = now.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
  const date = now.toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long" });

  function renderPage() {
    switch (page) {
      case "home":     return <HomePage enabledApps={enabledApps} />;
      case "chat":     return <ChatPage />;
      case "news":     return <NewsPage />;
      case "convs":    return <ConversationsPage />;
      case "stats":    return <StatsPage />;
      case "memory":   return <MemoryPage />;
      case "fitness":  return <FitnessPage />;
      case "remind":   return <RemindersPage />;
      case "projects": return <ProjectsPage />;
      case "profile":  return <ProfilePage />;
      case "calendar": return <CalendarPage />;
      case "settings": return <SettingsPage onAppsChanged={loadEnabledApps} />;
      case "calendar": return <CalendarPage />;
      case "models":   return <ModelsPage onActiveChange={setHasActiveDownload} />;
      default:         return <HomePage enabledApps={enabledApps} />;
    }
  }

  return (
    <div className="shell">
      <Sidebar
        activePage={page}
        onNavigate={navigate}
        onLock={lock}
        hasActiveDownloads={hasActiveDownload}
        enabledNavIds={enabledApps}
      />
      <div className="main">
        <div className="topbar">
          <span className="topbar-title">{PAGE_TITLES[page] || page}</span>
          <div className="topbar-right">
            <span className="topbar-date">{date} · {time}</span>
            <button className="btn btn-ghost btn-sm" onClick={refresh} style={{padding:"2px 7px"}} title="Refresh">↻</button>
          </div>
        </div>
        <div key={`${page}-${pageKey}`} className="page-wrap page-enter"
             style={{overflow: FULL_HEIGHT_PAGES.has(page) ? "hidden" : "auto"}}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
