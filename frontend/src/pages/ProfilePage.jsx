const { useState, useEffect } = React;

function ProfilePage() {
  const [name,    setName]    = useState("");
  const [brief,   setBrief]   = useState("");
  const [city,    setCity]    = useState("");
  const [tz,      setTz]      = useState("");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [sources, setSources] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCountry, setAddCountry] = useState("World");
  const [addUrl,  setAddUrl]  = useState("");

  useEffect(() => {
    api("/api/profile").then(p => { setName(p.name||""); setBrief(p.brief||""); setCity(p.city||""); setTz(p.timezone||""); }).catch(() => {});
    api("/api/news-sources").then(setSources).catch(() => {});
  }, []);

  async function saveProfile() {
    setSaving(true);
    try {
      await jsonPut("/api/profile", { name, brief, city, timezone: tz });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  }

  async function toggleSource(id) {
    const updated = sources.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
    setSources(updated);
    await jsonPut("/api/news-sources", { sources: updated }).catch(() => {});
  }

  async function deleteSource(id) {
    await httpDel(`/api/news-sources/${id}`).catch(() => {});
    setSources(prev => prev.filter(s => s.id !== id));
  }

  async function addSource() {
    if (!addName || !addUrl) return;
    const id = addName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    try {
      const result = await jsonPost("/api/news-sources", { id, name: addName, country: addCountry, url: addUrl, enabled: true });
      setSources(result.sources || []);
      setAddOpen(false); setAddName(""); setAddUrl("");
    } catch (e) { alert("Error: " + e.message); }
  }

  const countries = [...new Set(sources.map(s => s.country))];
  const PRESET_COUNTRIES = ["World", "Bulgaria", "Netherlands", "Tech", "Sport", "Local"];
  const allCountryOptions = [...new Set([...PRESET_COUNTRIES, ...countries])];

  return (
    <div className="pad">
      <div className="section-head">Profile & Settings</div>
      <div className="profile-layout">

        {/* Profile form */}
        <div className="profile-card">
          <div className="card-title">Your Profile</div>
          <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
            <div className="form-field"><label className="form-label">Name</label><input className="input" value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="form-field"><label className="form-label">City</label><input className="input" value={city} onChange={e => setCity(e.target.value)} /></div>
            <div className="form-field"><label className="form-label">Timezone</label><input className="input" value={tz} onChange={e => setTz(e.target.value)} placeholder="e.g. Europe/Amsterdam" /></div>
            <div className="form-field">
              <label className="form-label">About you <span style={{ color:"var(--text3)", fontWeight:400, textTransform:"none" }}>(injected into every conversation)</span></label>
              <textarea
                className="input" rows={8} value={brief} onChange={e => setBrief(e.target.value)}
                style={{ resize:"vertical", fontFamily:"var(--font)", lineHeight:1.6 }}
                placeholder="What you do, study, background, habits, preferences…"
              />
            </div>
            <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
              {saving ? "Saving…" : saved ? "✓ Saved" : "Save Profile"}
            </button>
          </div>
        </div>

        {/* News sources */}
        <div className="profile-card">
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <div className="card-title" style={{ marginBottom:0 }}>News Sources</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setAddOpen(!addOpen)}>+ Add</button>
          </div>

          {addOpen && (
            <div className="add-source-form" style={{ marginBottom:12 }}>
              <div className="form-field add-source-full">
                <label className="form-label">Display name</label>
                <input className="input" placeholder="e.g. Dnes.bg" value={addName} onChange={e => setAddName(e.target.value)} autoFocus />
              </div>
              <div className="form-field">
                <label className="form-label">Country / Section</label>
                <select className="input" value={addCountry} onChange={e => setAddCountry(e.target.value)}>
                  {allCountryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-field add-source-full">
                <label className="form-label">RSS URL</label>
                <input className="input" placeholder="https://example.com/rss.xml" value={addUrl} onChange={e => setAddUrl(e.target.value)} />
              </div>
              <div className="add-source-full" style={{ display:"flex", gap:7 }}>
                <button className="btn btn-primary btn-sm" onClick={addSource} disabled={!addName || !addUrl}>Add source</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAddOpen(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ fontSize:11, color:"var(--text3)", marginBottom:10, lineHeight:1.5 }}>
            Toggle on/off. Changes apply on the next Briefing load.
          </div>
          {countries.length === 0 && <div className="no-data">No sources yet. Click + Add above.</div>}
          {countries.map(country => (
            <div key={country} style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:"var(--cyan)", fontFamily:"var(--mono)", letterSpacing:"1px", textTransform:"uppercase", marginBottom:5 }}>
                {country}
              </div>
              {sources.filter(s => s.country === country).map(s => (
                <div key={s.id} className="source-item">
                  <button className={`source-toggle ${s.enabled ? "on" : "off"}`} onClick={() => toggleSource(s.id)} />
                  <span className="source-name">{s.name}</span>
                  <button
                    onClick={() => deleteSource(s.id)}
                    style={{ background:"none", border:"none", color:"var(--text3)", cursor:"pointer", fontSize:12, padding:"0 4px", transition:"color .15s" }}
                    onMouseEnter={e => e.target.style.color = "var(--red)"}
                    onMouseLeave={e => e.target.style.color = "var(--text3)"}
                    title="Remove source"
                  >✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
