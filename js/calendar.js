/* Calendar page */
(() => {
  const T = Tidy, U = T.ui, root = document.getElementById("main");
  const now = new Date(); let month = new Date(now.getFullYear(), now.getMonth(), 1);
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const tone = t => T.cat(t.categoryId)?.tone || "slate";

  /* Shared task table used by "Today's tasks" and "Other tasks" */
  function table(ts, { time, empty }) {
    const rows = ts.map(t => {
      const c = T.cat(t.categoryId), list = T.state.lists.find(l => l.id === t.listId);
      return `<tr class="${t.done ? "done" : ""}">
        <td class="col-check"><button class="check${t.done ? " on" : ""}" data-toggle="${t.id}" aria-label="${t.done ? "Mark incomplete" : "Mark complete"}">${t.done ? U.icons.check : ""}</button></td>
        <td class="cell-title">${T.esc(t.title)}${t.repeat ? ` <span class="time muted" title="${T.esc(T.repeatLabel(t.repeat))}">${U.icons.repeat}</span>` : ""}</td>
        <td>${c ? `<span class="chip t-${c.tone}">${T.esc(c.name)}</span>` : '<span class="muted">None</span>'}</td>
        <td class="muted">${time ? (t.time ? T.fmtTime(t.time) : "Anytime") : T.esc(list?.title || "")}</td>
        <td class="col-act"><button class="icon-btn" data-edit="${t.id}" aria-label="Edit task">${U.icons.pencil}</button></td></tr>`;
    }).join("");
    return `<div class="table-wrap"><table class="tasks"><thead><tr><th class="col-check"><span class="sr-only">Done</span></th><th>Task</th><th>Category</th><th>${time ? "Time" : "List"}</th><th class="col-act"><span class="sr-only">Edit</span></th></tr></thead><tbody>
      ${rows || `<tr><td colspan="5" class="muted" style="text-align:center;padding:1.5rem">${empty}</td></tr>`}</tbody></table></div>`;
  }

  function render() {
    const y = month.getFullYear(), m = month.getMonth(), S = T.state, ws = S.prefs.weekStart;
    const lead = (new Date(y, m, 1).getDay() - ws + 7) % 7, days = new Date(y, m + 1, 0).getDate(), prevDays = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = lead; i > 0; i--) cells.push({ n: prevDays - i + 1, out: true });
    for (let d = 1; d <= days; d++) cells.push({ n: d, key: T.toKey(new Date(y, m, d)) });
    for (let d = 1; cells.length % 7; d++) cells.push({ n: d, out: true });
    const todayKey = T.toKey(now), undated = S.tasks.filter(t => !t.due);
    const todays = S.tasks.filter(t => t.due === todayKey).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    const dow = [...DOW.slice(ws), ...DOW.slice(0, ws)];

    root.innerHTML = `<div class="container">
      <div class="page-head"><div><h1>Calendar</h1><p>Select a day to see everything due.</p></div>
        <div class="head-actions"><button class="btn btn-primary" id="add">${U.icons.plus} Add task</button></div></div>
      <section class="card cal"><div class="cal-bar">
        <button class="icon-btn" id="prev" aria-label="Previous month">${U.icons.left}</button>
        <h2>${month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <button class="icon-btn" id="next" aria-label="Next month">${U.icons.right}</button></div>
        <div class="cal-grid">${dow.map(d => `<div class="cal-dow">${d}</div>`).join("")}
        ${cells.map(c => {
          if (c.out) return `<div class="day out">${c.n}</div>`;
          const ts = S.tasks.filter(t => t.due === c.key);
          return `<button class="day${c.key === todayKey ? " today" : ""}" data-day="${c.key}" aria-label="${T.fmtDate(c.key)}, ${ts.length} due">${c.n}
            <span class="dots">${ts.slice(0, 4).map(t => `<i class="t-${tone(t)}${t.done ? " done" : ""}"></i>`).join("")}${ts.length > 4 ? `<em>+${ts.length - 4}</em>` : ""}</span></button>`;
        }).join("")}</div>
        <div class="legend">${S.categories.map(c => `<span><i class="t-${c.tone}"></i>${T.esc(c.name)}</span>`).join("")}
          <button id="manage">Manage categories</button></div></section>

      <section class="card table-card"><div class="section-head"><h2>Today's tasks</h2><span class="count">${todays.length}</span></div>
        ${table(todays, { time: true, empty: "Nothing due today." })}</section>

      <section class="card table-card"><div class="section-head"><h2>Other tasks</h2><span class="count">${undated.length}</span></div>
        ${table(undated, { time: false, empty: "Every task has a date." })}</section></div>`;

    document.getElementById("prev").onclick = () => { month = new Date(y, m - 1, 1); render(); };
    document.getElementById("next").onclick = () => { month = new Date(y, m + 1, 1); render(); };
    document.getElementById("add").onclick = () => U.taskDialog({ done: render });
    document.getElementById("manage").onclick = () => U.manageCategories({ done: render });
    root.querySelectorAll("[data-day]").forEach(b => b.onclick = () => dayDialog(b.dataset.day));
  }

  function dayDialog(key) {
    const ts = T.state.tasks.filter(t => t.due === key), label = T.parseKey(key).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const d = U.modal(`<div class="dialog-body"><h2>${label}</h2><p class="muted">${ts.length} ${ts.length === 1 ? "task" : "tasks"} due</p>
      <div class="task-list">${ts.length ? ts.map(t => U.taskRow(t, { date: false, edit: false })).join("") : '<p class="empty">Nothing due this day.</p>'}</div>
      <div class="dialog-actions"><button class="btn btn-primary" id="add-day">${U.icons.plus} Add task</button><button class="btn btn-outline" data-close>Close</button></div></div>`);
    d.querySelector("#add-day").onclick = () => { d.close(); U.taskDialog({ due: key, done: render }); };
    d.addEventListener("click", e => {
      const tg = e.target.closest("[data-toggle]"); if (!tg) return;
      e.stopPropagation(); U.run(async () => { await U.toggle(tg.dataset.toggle); d.close(); render(); dayDialog(key); }, tg);
    }, true);
  }
  U.page({ render });
})();
