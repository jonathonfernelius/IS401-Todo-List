/* Tidy — shared page shell, task row, dialogs, toast */
(() => {
  const T = window.Tidy, esc = T.esc;
  const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const icons = {
    check: svg('<path d="m5 12 4 4L19 6"/>'), pencil: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>'), clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'), down: svg('<path d="m6 9 6 6 6-6"/>'),
    left: svg('<path d="m15 18-6-6 6-6"/>'), right: svg('<path d="m9 18 6-6-6-6"/>'), cloud: svg('<path d="M17.5 19H8a5 5 0 1 1 1-9.9A6 6 0 0 1 20.3 12a3.5 3.5 0 0 1-2.8 7Z"/>'),
    logo: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),
    repeat: svg('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
    home: svg('<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-7h6v7"/>'),
    list: svg('<path d="M8 6h12M8 12h12M8 18h12"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
    calendar: svg('<rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 9.5h18"/>'),
    user: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>')
  };

  let toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role", "status"); document.body.append(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
  }

  async function run(action, element) {
    if (element?.dataset.busy) return;
    if (element) { element.dataset.busy = '1'; element.disabled = true; }
    try { await action(); }
    catch (error) { toast(error.message || 'Could not save. Please try again.'); }
    finally { if (element) { delete element.dataset.busy; element.disabled = false; } }
  }

  function modal(html) {
    const d = document.createElement("dialog");
    d.className = "dialog"; d.innerHTML = html; document.body.append(d);
    d.addEventListener("close", () => d.remove());
    d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
    d.showModal(); return d;
  }

  function taskRow(t, { edit = true, date = true, overdue = false } = {}) {
    const c = T.cat(t.categoryId);
    return `<div class="task${t.done ? " done" : ""}${overdue ? " overdue" : ""}">
      <button class="check${t.done ? " on" : ""}" data-toggle="${t.id}" aria-label="${t.done ? "Mark incomplete" : "Mark complete"}">${t.done ? icons.check : ""}</button>
      <div class="task-body"><p class="task-title">${esc(t.title)}</p><div class="task-meta">
        ${c ? `<span class="chip t-${c.tone}">${esc(c.name)}</span>` : ""}
        ${date && t.due ? `<span class="${overdue ? "late" : ""}">${T.fmtDate(t.due)}</span>` : ""}
        ${t.time ? `<span class="time">${icons.clock}${T.fmtTime(t.time)}</span>` : ""}
        ${t.repeat ? `<span class="time">${icons.repeat}${esc(T.repeatLabel(t.repeat))}</span>` : ""}
        ${t.fromCanvas ? "<span>Canvas</span>" : ""}</div></div>
      ${edit ? `<button class="icon-btn" data-edit="${t.id}" aria-label="Edit task">${icons.pencil}</button>` : ""}</div>`;
  }

  const options = (items, sel) => items.map(([v, l]) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(l)}</option>`).join("");

  function manageCategories({ done }) {
    const body = () => `<div class="dialog-body"><h2>Manage categories</h2>
      <div class="cat-list">${T.categories.map(c => `<div class="cat-row t-${c.tone}"><span class="dot"></span><strong>${esc(c.name)}</strong>
        <small>${T.state.tasks.filter(t => t.categoryId === c.id).length} tasks</small>
        <button class="icon-btn" data-cat="${c.id}" aria-label="Edit ${esc(c.name)}">${icons.pencil}</button></div>`).join("") || '<p class="empty">No categories yet.</p>'}</div>
      <div class="dialog-actions"><button class="btn btn-primary" id="mc-add">${icons.plus} Add category</button><button class="btn btn-outline" data-close>Done</button></div></div>`;
    const d = modal(body());
    const redraw = () => { d.innerHTML = body(); if (done) done(); };
    d.addEventListener("click", e => {
      const b = e.target.closest("[data-cat]");
      if (b) categoryDialog({ cat: T.cat(b.dataset.cat), done: redraw });
      else if (e.target.closest("#mc-add")) categoryDialog({ done: redraw });
    });
  }

  const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function recurrenceDialog({ rule, due, done, cancel }) {
    const ws = T.state.prefs.weekStart, base = due ? T.parseKey(due) : new Date();
    const r = rule || { unit: "week", interval: 1, days: [base.getDay()] }, end = r.end || { type: "never" };
    const later = new Date(base); later.setMonth(later.getMonth() + 6);
    const order = [0, 1, 2, 3, 4, 5, 6].map(i => (i + ws) % 7);
    let saved = false;
    const d = modal(`<form class="dialog-body"><h2>Custom recurrence</h2>
      <div class="rec-row"><label for="r-n">Repeat every</label>
        <input class="rec-in" id="r-n" type="number" min="1" max="99" value="${r.interval || 1}">
        <select class="rec-in" id="r-u" aria-label="Unit">${options([["day", "day"], ["week", "week"], ["month", "month"], ["year", "year"]], r.unit)}</select></div>
      <fieldset class="fs${r.unit === "week" ? "" : " hide"}" id="r-days"><legend>Repeat on</legend><div class="days">${order.map(i => `<label class="daybtn"><input type="checkbox" value="${i}"${(r.days || []).includes(i) ? " checked" : ""}><span aria-hidden="true">${T.dayNames[i][0]}</span><span class="sr-only">${FULL_DAYS[i]}</span></label>`).join("")}</div></fieldset>
      <fieldset class="fs"><legend>Ends</legend>
        <div class="end-row"><label><input type="radio" name="end" value="never"${end.type === "never" ? " checked" : ""}> Never</label></div>
        <div class="end-row"><label><input type="radio" name="end" value="on"${end.type === "on" ? " checked" : ""}> On</label><input class="rec-in" id="r-date" type="date" aria-label="End date" value="${end.date || T.toKey(later)}"></div>
        <div class="end-row"><label><input type="radio" name="end" value="after"${end.type === "after" ? " checked" : ""}> After</label><input class="rec-in" id="r-count" type="number" min="1" max="999" aria-label="Occurrences" value="${end.count || 10}"><span class="muted">occurrences</span></div></fieldset>
      <div class="dialog-actions"><button type="button" class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary">Done</button></div></form>`);
    const q = id => d.querySelector("#" + id);
    const sync = () => {
      const t = d.querySelector("[name=end]:checked").value;
      q("r-date").disabled = t !== "on"; q("r-count").disabled = t !== "after";
      q("r-days").classList.toggle("hide", q("r-u").value !== "week");
    };
    d.addEventListener("change", sync); sync();
    d.addEventListener("close", () => { if (!saved && cancel) cancel(); });
    d.querySelector("form").onsubmit = e => { e.preventDefault(); run(async () => {
      e.preventDefault();
      const unit = q("r-u").value, t = d.querySelector("[name=end]:checked").value;
      const out = { unit, interval: Math.max(1, parseInt(q("r-n").value, 10) || 1) };
      if (unit === "week") {
        out.days = [...d.querySelectorAll(".days input:checked")].map(i => Number(i.value));
        if (!out.days.length) { toast("Pick at least one day."); return; }
      }
      if (t === "on") { if (!q("r-date").value) { toast("Choose an end date."); return; } out.end = { type: "on", date: q("r-date").value }; }
      else if (t === "after") out.end = { type: "after", count: Math.max(1, parseInt(q("r-count").value, 10) || 1) };
      else out.end = { type: "never" };
      saved = true; d.close(); done(out);
    }, e.submitter); };
  }

  const listOptions = sel => options([...T.state.lists.map(l => [l.id, l.title]), ["__new", "+ New list…"]], sel);

  function listDialog({ done }) {
    const d = modal(`<form class="dialog-body"><h2>New list</h2>
      <div class="field"><label for="l-name">List name</label><input id="l-name" required maxlength="30" placeholder="e.g. Club events"></div>
      <div class="dialog-actions"><button class="btn btn-primary">Add list</button><button type="button" class="btn btn-outline" data-close>Cancel</button></div></form>`);
    d.querySelector("form").onsubmit = e => { e.preventDefault(); run(async () => {
      e.preventDefault();
      const name = d.querySelector("#l-name").value.trim(); if (!name) return;
      const l = await T.addList(name); d.close(); toast("List added"); done(l);
    }, e.submitter); };
  }

  const catOptions = sel => options([...T.categories.map(c => [c.id, c.name]), ["", "No category"], ["__new", "+ New category…"]], sel);

  function categoryDialog({ cat, done }) {
    const tone = cat?.tone || T.tones.find(t => !T.categories.some(c => c.tone === t)) || T.tones[0];
    const d = modal(`<form class="dialog-body"><h2>${cat ? "Edit category" : "New category"}</h2>
      <div class="field"><label for="c-name">Name</label><input id="c-name" required maxlength="24" value="${esc(cat?.name)}" placeholder="e.g. UX Design"></div>
      <fieldset class="field"><legend>Color</legend><div class="swatches">${T.tones.map(t => `<label class="swatch t-${t}"><input type="radio" name="tone" value="${t}"${t === tone ? " checked" : ""}><span></span><span class="sr-only">${t}</span></label>`).join("")}</div></fieldset>
      <div class="dialog-actions"><button class="btn btn-primary">${cat ? "Save category" : "Add category"}</button><button type="button" class="btn btn-outline" data-close>Cancel</button></div>
      ${cat ? `<button type="button" class="delete-link" id="c-del">${icons.trash} Delete category</button>` : ""}</form>`);
    d.querySelector("form").onsubmit = e => { e.preventDefault(); run(async () => {
      e.preventDefault();
      const name = d.querySelector("#c-name").value.trim(), t = d.querySelector("[name=tone]:checked").value;
      if (!name) return;
      let c = cat; if (cat) await T.updateCategory(cat.id, { name, tone: t }); else c = await T.addCategory(name, t);
      d.close(); toast(cat ? "Category updated" : "Category added"); done(c);
    }, e.submitter); };
    if (cat) d.querySelector("#c-del").onclick = e => run(async () => { await T.deleteCategory(cat.id); d.close(); toast("Category deleted"); done(null); }, e.currentTarget);
  }

  function taskDialog({ task, listId, due, done }) {
    const S = T.state, r = task?.reminder;
    let repeatVal = task?.repeat || null;
    const repOptions = () => {
      const cur = repeatVal && typeof repeatVal === "object" ? repeatVal : null;
      return options([["", "Does not repeat"], ...Object.entries(T.repeats), ...(cur ? [["__cur", T.repeatLabel(cur)]] : []), ["__custom", "Custom…"]], cur ? "__cur" : repeatVal || "");
    };
    const d = modal(`<form class="dialog-body">
      <h2>${task ? "Edit task" : "Add task"}</h2>
      <div class="field"><label for="f-title">Task</label><input id="f-title" required value="${esc(task?.title)}" placeholder="What needs to get done?"></div>
      <div class="grid-2">
        <div class="field"><label for="f-cat">Category</label><select id="f-cat">${catOptions(task ? task.categoryId ?? "" : undefined)}</select></div>
        <div class="field"><label for="f-list">List</label><select id="f-list">${listOptions(task?.listId || listId)}</select></div>
      </div>
      <div class="grid-2">
        <div class="field"><label for="f-due">Due date</label><input id="f-due" type="date" value="${task?.due || due || ""}"></div>
        <div class="field"><label for="f-time">Time (optional)</label><input id="f-time" type="time" value="${task?.time || ""}"></div>
      </div>
      <div class="field"><label for="f-rep">Repeat</label><select id="f-rep">${repOptions()}</select>
        <small class="hint${task?.repeat ? "" : " hide"}" id="rep-hint">Marking it done adds the next one automatically.</small></div>
      <div class="switch-row"><label for="f-rem">Reminder preference</label><span class="switch"><input id="f-rem" type="checkbox"${r ? " checked" : ""}><span></span></span></div>
      <p class="muted">Saved for later; notifications are not enabled yet.</p><div class="field${r ? "" : " hide"}" id="rem-wrap"><label for="f-remwhen">Remind me</label><select id="f-remwhen">${options([["15m", "15 minutes before"], ["1h", "1 hour before"], ["1d", "1 day before"], ["1w", "1 week before"]], r || "1h")}</select></div>
      <div class="dialog-actions"><button class="btn btn-primary">${task ? "Update" : "Save task"}</button><button type="button" class="btn btn-outline" data-close>Cancel</button></div>
      ${task ? `<button type="button" class="delete-link" id="f-del">${icons.trash} Delete task</button>` : ""}</form>`);
    const q = id => d.querySelector("#" + id);
    let prev = q("f-cat").value;
    q("f-cat").onchange = e => {
      if (e.target.value !== "__new") { prev = e.target.value; return; }
      e.target.value = prev;
      categoryDialog({ done: c => { if (c) { q("f-cat").innerHTML = catOptions(c.id); prev = c.id; } } });
    };
    let prevList = q("f-list").value;
    q("f-list").onchange = e => {
      if (e.target.value !== "__new") { prevList = e.target.value; return; }
      e.target.value = prevList;
      listDialog({ done: l => { q("f-list").innerHTML = listOptions(l.id); prevList = l.id; } });
    };
    let prevRep = q("f-rep").value;
    q("f-rep").onchange = e => {
      const v = e.target.value;
      if (v === "__custom") {
        recurrenceDialog({
          rule: repeatVal && typeof repeatVal === "object" ? repeatVal : null, due: q("f-due").value,
          done: rule => { repeatVal = rule; q("f-rep").innerHTML = repOptions(); prevRep = q("f-rep").value; q("rep-hint").classList.remove("hide"); },
          cancel: () => { q("f-rep").value = prevRep; }
        });
        return;
      }
      if (v !== "__cur") repeatVal = v || null;
      prevRep = q("f-rep").value;
      q("rep-hint").classList.toggle("hide", !repeatVal);
    };
    q("f-rem").onchange = e => q("rem-wrap").classList.toggle("hide", !e.target.checked);
    d.querySelector("form").onsubmit = e => { e.preventDefault(); run(async () => {
      e.preventDefault();
      const p = { title: q("f-title").value.trim(), categoryId: q("f-cat").value || null, listId: q("f-list").value, due: q("f-due").value || null, time: q("f-time").value || null, reminder: q("f-rem").checked ? q("f-remwhen").value : null, repeat: repeatVal };
      if (p.repeat && !p.due) p.due = T.toKey(new Date());
      if (!p.title) return;
      if (p.listId === "__new") throw new Error("Create a list before saving this task.");
      await (task ? T.updateTask(task.id, p) : T.addTask(p));
      d.close(); toast(task ? "Task updated" : "Task added"); done();
    }, e.submitter); };
    if (task) q("f-del").onclick = e => run(async () => { await T.deleteTask(task.id); d.close(); toast("Task deleted"); done(); }, e.currentTarget);
  }

  async function toggle(id) {
    const r = await T.toggleTask(id);
    if (r.next) toast(`Done. The next one is due ${T.fmtDate(r.next)}.`);
    else if (r.ended) toast("Done. That was the last one in the series.");
  }

  const NAV = [["home.html", "Today", "home", "home"], ["todo.html", "To-do", "todo", "list"], ["calendar.html", "Calendar", "calendar", "calendar"], ["profile.html", "Profile", "profile", "user"]];

  /* page({ render }) builds header/footer, guards sign-in, and re-renders after changes */
  async function page({ render }) {
    const main = document.getElementById('main');
    main.innerHTML = '<div class="container"><p class="empty" role="status">Loading your workspace…</p></div>';
    try { await T.init(); }
    catch(error) {
      main.innerHTML = `<div class="container"><section class="card"><h1>Could not load Tidy</h1><p role="alert">${esc(error.message)}</p><p>Check your connection and make sure setup.sql has been run.</p><button class="btn btn-primary" id="retry-load">Retry</button> <a href="index.html">Back to login</a></section></div>`;
      document.getElementById('retry-load').onclick=()=>location.reload(); return;
    }
    if (!T.state.signedIn) { location.replace("index.html"); return; }
    const key = document.body.dataset.page, u = T.state.user;
    document.body.insertAdjacentHTML("afterbegin", `<a class="sr-only" href="#main">Skip to content</a>
      <header class="site-header"><div class="container header-row">
        <a class="brand" href="home.html"><span class="brand-mark">${icons.logo}</span>Tidy</a>
        <nav class="nav" aria-label="Main">${NAV.map(([h, l, k, i]) => `<a href="${h}"${k === key ? ' aria-current="page"' : ""}><span class="ico">${icons[i]}</span><span>${l}</span></a>`).join("")}</nav>
        <a class="avatar" href="profile.html" aria-label="Your profile">${esc(u.first[0] || "")}${esc(u.last[0] || "")}</a></div></header>`);
    document.body.insertAdjacentHTML("beforeend", `<footer class="site-footer"><div class="container footer-row">
      <span>Tidy. Classes and life, on one short list.</span>
      <nav aria-label="Footer">${NAV.map(([h, l]) => `<a href="${h}">${l}</a>`).join("")}</nav></footer>`);
    const rerender = () => render();
    document.addEventListener("click", e => {
      const tg = e.target.closest("[data-toggle]"), ed = e.target.closest("[data-edit]");
      if (tg) run(async () => { await toggle(tg.dataset.toggle); rerender(); }, tg);
      if (ed) taskDialog({ task: T.state.tasks.find(t => t.id === ed.dataset.edit), done: rerender });
    });
    rerender();
  }

  window.Tidy.ui = { run, icons, toast, modal, taskRow, taskDialog, categoryDialog, manageCategories, recurrenceDialog, listDialog, toggle, page, options };
})();
