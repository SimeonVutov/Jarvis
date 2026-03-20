const { useState, useEffect, useRef } = React;

const PAGE_TITLES = {
  home:"Home", chat:"Chat", news:"Briefing", convs:"History",
  stats:"Stats", memory:"Memory", fitness:"Fitness", remind:"Reminders",
  projects:"Projects", profile:"Profile", models:"Models",
};
const FULL_HEIGHT_PAGES = new Set(["chat","convs","projects"]);

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [page,     setPage]     = useState("home");
  const [pageKey,  setPageKey]  = useState(0);
  const [pulls,    setPulls]    = useState({});
  const pollRef = useRef(null);

  useEffect(() => {
    api("/api/status").then(d => { if (d.unlocked) setUnlocked(true); }).catch(() => {});
  }, []);

  // Poll download status at App level so it survives page navigation
  useEffect(() => {
    if (!unlocked) return;
    function poll() {
      api("/api/models/pull/all").then(data => {
        setPulls(data);
        const active = Object.values(data).some(v => v.status === "downloading" || v.status === "queued");
        if (!active) { clearInterval(pollRef.current); pollRef.current = null; }
      }).catch(() => {});
    }
    pollRef.current = setInterval(poll, 1500);
    poll();
    return () => clearInterval(pollRef.current);
  }, [unlocked]);

  // Restart polling whenever a new download is started
  function ensurePolling() {
    if (!pollRef.current) {
      pollRef.current = setInterval(() => {
        api("/api/models/pull/all").then(data => {
          setPulls(data);
          const active = Object.values(data).some(v => v.status === "downloading" || v.status === "queued");
          if (!active) { clearInterval(pollRef.current); pollRef.current = null; }
        }).catch(() => {});
      }, 1500);
    }
  }

  async function lock() {
    await jsonPost("/api/lock", {}).catch(() => {});
    setUnlocked(false);
  }

  function navigate(newPage) {
    setPage(newPage);
    setPageKey(k => k + 1);
  }

  if (!unlocked) return <LockScreen onUnlock={() => setUnlocked(true)} />;

  const hasActiveDownloads = Object.values(pulls).some(v => v.status === "downloading" || v.status === "queued");

  const now  = new Date();
  const time = now.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
  const date = now.toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long" });

  const pageProps = { pulls, setPulls: (...args) => { setPulls(...args); ensurePolling(); } };

  const Pages = {
    home:     () => <HomePage />,
    chat:     () => <ChatPage />,
    news:     () => <NewsPage />,
    convs:    () => <ConversationsPage />,
    stats:    () => <StatsPage />,
    memory:   () => <MemoryPage />,
    fitness:  () => <FitnessPage />,
    remind:   () => <RemindersPage />,
    projects: () => <ProjectsPage />,
    profile:  () => <ProfilePage />,
    models:   () => <ModelsPage pulls={pulls} setPulls={pageProps.setPulls} />,
  };
  const PageComponent = Pages[page] || Pages.home;

  return (
    <div className="shell">
      <Sidebar activePage={page} onNavigate={navigate} onLock={lock} hasActiveDownloads={hasActiveDownloads} />
      <div className="main">
        <div className="topbar">
          <span className="topbar-title">{PAGE_TITLES[page] || page}</span>
          <div className="topbar-right">
            <span className="topbar-date">{date} · {time}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPageKey(k => k + 1)} style={{ padding:"2px 7px" }}>↻</button>
          </div>
        </div>
        <div
          key={`${page}-${pageKey}`}
          className="page-wrap page-enter"
          style={{ overflow: FULL_HEIGHT_PAGES.has(page) ? "hidden" : "auto" }}
        >
          <PageComponent />
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
