const { useState } = React;

function LockScreen({ onUnlock }) {
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const result = await jsonPost("/api/unlock", { password });
      if (result.success) onUnlock(result.user);
      else setError("Wrong password");
    } catch {
      setError("Connection error — is the server running?");
    }
    setLoading(false);
  }

  return (
    <div className="lock">
      {/* Pulsing concentric rings */}
      <div style={{ position: "absolute", inset: 0 }}>
        {[180, 320, 460, 600].map((size, i) => (
          <div
            key={i}
            className="lock-ring"
            style={{
              width:  size, height: size,
              top:  `calc(50% - ${size / 2}px)`,
              left: `calc(50% - ${size / 2}px)`,
              animationDelay: `${i * 0.7}s`,
            }}
          />
        ))}
      </div>

      <div className="lock-box">
        <div className="lock-glyph">J</div>
        <div className="lock-sub">PERSONAL AI ASSISTANT</div>
        <form className="lock-form" onSubmit={handleSubmit}>
          <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", letterSpacing: "1px", marginBottom: 5 }}>
            PASSPHRASE
          </div>
          <input
            className="lock-input"
            type="password"
            placeholder="enter your key…"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            disabled={loading}
          />
          {error && <div className="lock-error">{error}</div>}
          <button className="lock-submit" disabled={loading || !password}>
            {loading ? "VERIFYING…" : "UNLOCK →"}
          </button>
          <div style={{ fontSize: 10, color: "var(--text3)", textAlign: "center", marginTop: 9 }}>
            AES-256-GCM · all data local · no cloud
          </div>
        </form>
      </div>
    </div>
  );
}
