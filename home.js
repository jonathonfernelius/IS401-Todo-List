/* Today page — the daily stack */
(() => {
  const T = Tidy, U = T.ui, root = document.getElementById("main");
  const rows = (list, empty, o) => list.length ? list.map(t => U.taskRow(t, o)).join("") : `<p class="empty">${empty}</p>`;

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
    document.getElementById("add").onclick = () => U.taskDialog({ due: today, done: render });
  }
  U.page({ render });
})();
