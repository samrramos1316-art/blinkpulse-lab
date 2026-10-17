export function PreviewPanel() {
  return (
    <section className="card preview" aria-labelledby="preview-title">
      <h2 id="preview-title" className="visually-hidden">
        Camera preview
      </h2>
      <div className="preview__frame">
        <svg className="preview__guide" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
          <ellipse cx="100" cy="72" rx="38" ry="50" />
        </svg>
        <p className="preview__hint">Your camera preview will appear here.</p>
      </div>
      <p className="preview__status">Not started</p>
    </section>
  );
}
