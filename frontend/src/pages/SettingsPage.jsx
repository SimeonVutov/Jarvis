const { useState, useEffect } = React;

function SettingsPage({ onAppsChanged }) {
  const [apps,    setApps]    = useState([]);
  const [saving,  setSaving]  = useState(null); // app id being toggled

  useEffect(() => {
    api("/api/apps").then(setApps).catch(() => {});
  }, []);

  async function toggleApp(id, currentlyEnabled) {
    setSaving(id);
    try {
      await jsonPut(`/api/apps/${id}`, { enabled: !currentlyEnabled });
      setApps(prev => prev.map(a => a.id === id ? { ...a, enabled: !currentlyEnabled } : a));
      // Tell App.jsx to reload the enabled set so the sidebar updates immediately
      onAppsChanged();
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSaving(null);
  }

  const coreApps     = apps.filter(a => a.core);
  const optionalApps = apps.filter(a => !a.core);

  return (
    <div className="pad">
      <div className="section-head">Settings</div>

      {/* Optional apps */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-title">Feature Apps</div>
        <div style={{ fontSize:12, color:"var(--text3)", marginBottom:14, lineHeight:1.6 }}>
          Disable apps you don't use. Their data is preserved and can be restored
          by re-enabling. Disabled apps are hidden from the sidebar and their data
          is excluded from AI context.
        </div>

        {optionalApps.map(app => (
          <div key={app.id} style={{
            display:"flex", alignItems:"center", gap:12, padding:"11px 0",
            borderBottom:"1px solid rgba(26,45,74,.4)",
          }}>
            <span style={{ fontSize:18, width:24, textAlign:"center", flexShrink:0 }}>{app.icon}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:500, color:"var(--text)", marginBottom:2 }}>{app.name}</div>
              <div style={{ fontSize:11, color:"var(--text3)", lineHeight:1.4 }}>{app.description}</div>
            </div>
            <button
              className={`source-toggle ${app.enabled ? "on" : "off"}`}
              onClick={() => toggleApp(app.id, app.enabled)}
              disabled={saving === app.id}
              title={app.enabled ? "Disable" : "Enable"}
            />
          </div>
        ))}

        {optionalApps.length === 0 && <div className="no-data">Loading…</div>}
      </div>

      {/* Core apps — shown for transparency, cannot be toggled */}
      <div className="card">
        <div className="card-title">Core Apps</div>
        <div style={{ fontSize:12, color:"var(--text3)", marginBottom:14, lineHeight:1.6 }}>
          These are part of the system and cannot be disabled.
        </div>
        {coreApps.map(app => (
          <div key={app.id} style={{
            display:"flex", alignItems:"center", gap:12, padding:"10px 0",
            borderBottom:"1px solid rgba(26,45,74,.4)", opacity:0.7,
          }}>
            <span style={{ fontSize:18, width:24, textAlign:"center", flexShrink:0 }}>{app.icon}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:500, color:"var(--text)", marginBottom:2 }}>{app.name}</div>
              <div style={{ fontSize:11, color:"var(--text3)" }}>{app.description}</div>
            </div>
            <span style={{ fontSize:10, fontFamily:"var(--mono)", color:"var(--text3)", padding:"2px 8px", border:"1px solid var(--border)", borderRadius:4 }}>
              core
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
