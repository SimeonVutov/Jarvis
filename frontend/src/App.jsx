const { useState, useEffect, useRef } = React;

const PAGE_TITLES = {
  home: "Home", chat: "Chat", news: "Briefing", convs: "History",
  stats: "Stats", memory: "Memory", fitness: "Fitness", remind: "Reminders",
  projects: "Projects", profile: "Profile", models: "Models",
};

const FULL_HEIGHT_PAGES = new Set(["chat", "convs", "projects"]);

function App() {
  const [unlocked,          setUnlocked]          = useState(false);
  const [page,              setPage]               = useState("home");
  const [pageKey,           setPageKey]            = useState(0);
  // Only a boolean — does NOT change every 1.5s, so App does NOT re-render constantly.
  // All the detailed pull data lives inside ModelsPage itself.
  const [hasActiveDownload, setHasActiveDownload]  = useState(false);

  // On load: check if server already has an unlocked session
  useEffect(() => {
    api("/api/status").then(d => { if (d.unlocked) setUnlocked(true); }).catch(() => {});
  }, []);

  // On unlock: do a single check in case a download was already running
  useEffect(() => {
    if (!unlocked) return;
    api("/api/models/pull/all").then(data => {
      const active = Object.values(data).some(
        v => v.status === "downloading" || v.status === "queued"
      );
      setHasActiveDownload(active);
    }).catch(() => {});
  }, [unlocked]);

  async function lock() {
    await jsonPost("/api/lock", {}).catch(() => {});
    setUnlocked(false);
  }

  function navigate(newPage) {
    setPage(newPage);
    setPageKey(k => k + 1);
  }

  function refresh() {
    setPageKey(k => k + 1);
  }

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

  const now  = new Date();
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  function renderPage() {
    switch (page) {
      case "home":     return <HomePage />;
      case "chat":     return <ChatPage />;
      case "news":     return <NewsPage />;
      case "convs":    return <ConversationsPage />;
      case "stats":    return <StatsPage />;
      case "memory":   return <MemoryPage />;
      case "fitness":  return <FitnessPage />;
      case "remind":   return <RemindersPage />;
      case "projects": return <ProjectsPage />;
      case "profile":  return <ProfilePage />;
      // ModelsPage owns its own pull state and polling — it notifies App only
      // when the "has active download" boolean changes (for the sidebar dot).
      case "models":   return <ModelsPage onActiveChange={setHasActiveDownload} />;
      default:         return <HomePage />;
    }
  }

  return (
    <div className="shell">
      <Sidebar
        activePage={page}
        onNavigate={navigate}
        onLock={lock}
        hasActiveDownloads={hasActiveDownload}
      />
      <div className="main">
        <div className="topbar">
          <span className="topbar-title">{PAGE_TITLES[page] || page}</span>
          <div className="topbar-right">
            <span className="topbar-date">{date} · {time}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={refresh}
              style={{ padding: "2px 7px" }}
              title="Refresh page"
            >↻</button>
          </div>
        </div>
        <div
          key={`${page}-${pageKey}`}
          className="page-wrap page-enter"
          style={{ overflow: FULL_HEIGHT_PAGES.has(page) ? "hidden" : "auto" }}
        >
          {renderPage()}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
