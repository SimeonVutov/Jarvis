const { useState, useEffect } = React;

function NewsPage() {
  const [data,       setData]       = useState(null);
  const [activeTab,  setActiveTab]  = useState(null);

  useEffect(() => {
    api("/api/news").then(d => {
      setData(d);
      if (!activeTab && Object.keys(d || {}).length > 0)
        setActiveTab(Object.keys(d)[0]);
    }).catch(() => {});
  }, []);

  const countries    = data ? Object.keys(data) : [];
  const countryFeeds = data && activeTab ? data[activeTab] : {};

  return (
    <div className="pad">
      <div className="section-head">Daily Briefing</div>

      <div className="news-tabs">
        {countries.map(c => (
          <button key={c} className={`news-tab${activeTab === c ? " active" : ""}`} onClick={() => setActiveTab(c)}>
            {c}
          </button>
        ))}
        {!data && (
          <span style={{ color:"var(--text3)", fontSize:12, display:"flex", alignItems:"center", gap:8 }}>
            <Spinner size={12} /> Loading…
          </span>
        )}
        {data && countries.length === 0 && (
          <span style={{ color:"var(--text3)", fontSize:12 }}>
            No news sources configured. Add them in Profile → News Sources.
          </span>
        )}
      </div>

      {activeTab && Object.entries(countryFeeds).map(([feedId, feed]) => (
        <div key={feedId} className="feed-section">
          <div className="feed-head">{feed.name}</div>
          <div className="news-grid">
            {(feed.items || [])
              .filter(item => item.title && !item.title.startsWith("["))
              .map((item, i) => (
                <div key={i} className="news-card" style={{ animation: `fadeIn .14s ease ${i * 0.025}s both` }}>
                  <div className="news-card-title">
                    <a href={item.link || "#"} target="_blank" rel="noreferrer">{item.title}</a>
                  </div>
                  {item.summary && (
                    <div className="news-card-summary">{stripHtml(item.summary).substring(0, 200)}</div>
                  )}
                  <div className="news-card-pub">{item.published}</div>
                </div>
              ))}
            {(feed.items || []).length === 0 && (
              <div className="no-data" style={{ gridColumn:"1/-1" }}>Feed unavailable</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
