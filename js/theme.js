/* Apply the last confirmed theme before the first paint. Cloud settings stay authoritative. */
(() => {
  const key = 'coursewise-theme';
  const themes = ['green', 'teal', 'blue', 'purple', 'pink', 'orange'];
  function apply(theme, persist = true) {
    const selected = themes.includes(theme) ? theme : 'green';
    document.documentElement.dataset.theme = selected;
    if (persist) { try { localStorage.setItem(key, selected); } catch {} }
  }
  let saved;
  try { saved = localStorage.getItem(key); } catch {}
  apply(saved, false);
  window.CoursewiseTheme = { apply };

  // Start before external scripts load, so a slow network also gets feedback.
  if (document.documentElement.dataset.workspaceLoading === 'pending') {
    const timer = setTimeout(() => {
      if (document.documentElement.dataset.workspaceLoading === 'pending') {
        document.documentElement.dataset.workspaceLoading = 'slow';
      }
    }, 1000);
    window.CoursewiseLoading = {
      finish() {
        clearTimeout(timer);
        delete document.documentElement.dataset.workspaceLoading;
      }
    };
  }
})();
