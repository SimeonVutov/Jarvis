const { useState, useEffect, useRef } = React;

const PAGE_TITLES = {
  home:"Home", chat:"Chat", news:"Briefing", convs:"History",
  stats:"Stats", memory:"Memory", fitness:"Fitness", remind:"Reminders",
  calendar:"Calendar", projects:"Projects", profile:"Profile",
  models:"Models", settings:"Settings",
};

const FULL_HEIGHT_PAGES = new Set(["chat","convs","projects","calendar"]);

function App() {
  const [unlocked,          setUnlocked]          = useState(false);
  const [page,              setPage]               = useState("home");
  const [pageKey,           setPageKey]            = useState(0);
  const [hasActiveDownload, setHasActiveDownload]  = useState(false);
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
      setEnabledApps(new Set(["home","chat","news","convs","stats","memory","fitness","remind",
                               "calendar","projects","journal","profile","models","settings"]));
    }
  }

  async function lock() {
    await jsonPost("/api/lock", {}).catch(() => {});
    setUnlocked(false);
  }

  function navigate(newPage) { setPage(newPage); setPageKey(k => k + 1); }
  function refresh()         { setPageKey(k => k + 1); }

  if (!unlocked) return <LockScreen onUnlock={() => setUnlocked(true)} />;
  if (!enabledApps) return <div className="page-loading"><Spinner /></div>;

  const now  = new Date();
  const time = now.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
  const date = now.toLocaleDateString("en-GB",  { weekday:"long", day:"numeric", month:"long" });

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
      case "models":   return <ModelsPage onActiveChange={setHasActiveDownload} />;
      // journal is merged into home — redirect
      case "journal":  return <HomePage enabledApps={enabledApps} />;
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
            <button className="btn btn-ghost btn-sm" onClick={refresh}
                    style={{padding:"2px 7px"}} title="Refresh">↻</button>
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
