const { useState } = React;

function FileEditorModal({ file, projectId, onClose, onSaved }) {
  const [content, setContent] = useState(file.initialContent || "");
  const [saving,  setSaving]  = useState(false);

  async function save() {
    setSaving(true);
    try {
      await jsonPut(`/api/projects/${projectId}/files/${file.id}/content`, { content });
      onSaved(file.id, content);
      onClose();
    } catch (e) {
      alert("Save failed: " + e.message);
    }
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target.className === "modal-overlay" && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text)" }}>
            {file.filename}
          </span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <textarea
            className="paste-area"
            style={{ minHeight: 380, width: "100%" }}
            value={content}
            onChange={e => setContent(e.target.value)}
            autoFocus
          />
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
