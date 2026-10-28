/* Today page — the daily stack */
(() => {
  const T = Tidy, U = T.ui, root = document.getElementById("main");
  const rows = (list, empty, o) => list.length ? list.map(t => U.taskRow(t, o)).join("") : `<p class="empty">${empty}</p>`;

  let canvasStatus = null, statusRequested = false, reminderAnimated = false;
  const DISMISS_KEY = "cw-canvas-reminder-dismissed", DISMISS_DAYS = 7;
  const dismissed = () => { try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_DAYS * 864e5; } catch { return false; } };
  const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Only the first appearance animates; later re-renders (e.g. checking off a task) just draw it in place.
  function reminderHTML() {
    if (canvasStatus !== false || dismissed()) return "";
    const enter = !reminderAnimated; reminderAnimated = true;
    return `<div class="cw-reminder-wrap${enter ? " is-entering" : ""}"><div class="cw-reminder-inner"><aside class="cw-reminder" role="status">
        <span class="cw-reminder-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="m9 15 2 2 4-4"/></svg><i class="cw-spark a"></i><i class="cw-spark b"></i></span>
        <div class="cw-reminder-copy"><strong>Let Canvas fill your to-do list</strong><span>Connect once and your due dates show up here on their own. Takes about a minute.</span></div>
        <a class="btn btn-primary cw-reminder-cta" href="profile.html?canvasGuide=1#canvas">Connect Canvas <i aria-hidden="true">→</i></a>
        <button type="button" class="icon-btn cw-reminder-x" id="cw-reminder-x" aria-label="Hide this reminder for a week">×</button>
      </aside></div></div>`;
  }
  function render() {
    const today = T.toKey(new Date()), weekEnd = T.shift(7), all = T.state.tasks;
    const dueToday = all.filter(t => t.due === today);
    const open = dueToday.filter(t => !t.done), doneN = dueToday.length - open.length;
    const overdue = all.filter(t => !t.done && t.due && t.due < today);
    const week = all.filter(t => !t.done && t.due && t.due > today && t.due <= weekEnd);
    const date = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    root.innerHTML = `<div class="container">
      <div class="page-head"><div><h1>Hi, ${T.esc(T.state.user.first)}</h1><p>${date}</p></div>
        <div class="head-actions"><button class="btn btn-primary" id="add">${U.icons.plus} Add task</button></div></div>
      ${reminderHTML()}
      <div class="stack">
        <section class="hero" aria-label="Daily snapshot"><small>Daily snapshot</small>
          <h2>${open.length ? `${open.length} ${open.length === 1 ? "thing" : "things"} left today.` : dueToday.length ? "Today is done." : "Your day is clear."}</h2>
          <p>${doneN ? `${doneN} finished so far. Nice work.` : "Start with one small win."}</p>
          <div class="hero-stat"><strong>${open.length}</strong><span>open today</span></div></section>
        <section class="card overdue-card"><div class="section-head"><h2>Overdue</h2><span class="count warn">${overdue.length}</span></div>
          <div class="task-list">${rows(overdue, "You're all caught up.", { overdue: true })}</div></section>
        <section class="card week-card"><div class="section-head"><h2>This week</h2><span class="count">${week.length}</span></div>
          <div class="task-list">${rows(week, "Your week is clear.")}</div></section>
        <section class="card today-card"><div class="section-head"><h2>Today</h2><span class="count">${dueToday.length}</span></div>
          <div class="task-list">${rows(dueToday, "Nothing due today. Enjoy it.", { date: false })}</div></section>
      </div></div>`;
    if (!statusRequested) {
      statusRequested = true;
      window.tidyClient.functions.invoke("canvas-connect", { body: { action: "status" } }).then(({data, error}) => {
        if (!error && !data?.error && typeof data?.connected === "boolean") { canvasStatus = data.connected; render(); }
      }).catch(() => {});
    }
    const x = document.getElementById("cw-reminder-x");
    if (x) x.onclick = () => {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
      const wrap = x.closest(".cw-reminder-wrap");
      wrap.classList.remove("is-entering"); wrap.classList.add("is-leaving");
      setTimeout(() => wrap.remove(), calm() ? 20 : 480);
    };
    document.getElementById("add").onclick = () => U.taskDialog({ due: today, done: render });
  }
  U.page({ render });
})();
