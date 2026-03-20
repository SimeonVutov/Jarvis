function Spinner({ size = 15 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

function PageLoading() {
  return (
    <div className="page-loading">
      <Spinner /> <span>Loading…</span>
    </div>
  );
}
