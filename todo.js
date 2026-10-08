/* To-do page */
(() => {
  const T = Tidy, U = T.ui, root = document.getElementById("main");
  const collapsed = new Set(); let showDone;

  function render() {
    const S = T.state; if (showDone === undefined) showDone = !!S.prefs.showDone;
    root.innerHTML = `<div class="container">
      <div class="page-head"><div><h1>To-do</h1><p>Select a list title to collapse it.</p></div>
        <div class="head-actions"><button class="pill-btn" id="done-toggle">${showDone ? "Hide done" : "Show done"}</button>
        <button class="btn btn-outline" id="new-list">${U.icons.plus} New list</button>
        <button class="btn btn-primary" id="add">${U.icons.plus} Add task</button></div></div>
      <div class="lists">${S.lists.map(l => {
        const items = S.tasks.filter(t => t.listId === l.id && (showDone || !t.done)), open = !collapsed.has(l.id);
        return `<section class="card list-card"><div class="list-head">
          <button class="list-toggle" data-collapse="${l.id}" aria-expanded="${open}">${U.icons.down}<h2>${T.esc(l.title)}</h2><span class="count">${items.length}</span></button>
          <button class="icon-btn" data-rename="${l.id}" aria-label="Rename ${T.esc(l.title)}">${U.icons.pencil}</button>
          <button class="icon-btn danger" data-delete="${l.id}" aria-label="Delete ${T.esc(l.title)}">${U.icons.trash}</button></div>
          ${open ? `<div class="task-list">${items.length ? items.map(t => U.taskRow(t)).join("") : '<p class="empty">No tasks in this list.</p>'}</div>` : ""}</section>`;
      }).join("")}</div></div>`;

    document.getElementById("add").onclick = () => U.taskDialog({ done: render });
    document.getElementById("done-toggle").onclick = () => { showDone = !showDone; render(); };
    document.getElementById("new-list").onclick = () => nameDialog("New list", "", async v => { await T.addList(v); U.toast("List added"); render(); });
    root.querySelectorAll("[data-collapse]").forEach(b => b.onclick = () => { const id = b.dataset.collapse; collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); render(); });
    root.querySelectorAll("[data-rename]").forEach(b => b.onclick = () => { const l = S.lists.find(x => x.id === b.dataset.rename); nameDialog("Rename list", l.title, async v => { await T.renameList(l.id, v); render(); }); });
    root.querySelectorAll("[data-delete]").forEach(b => b.onclick = () => {
      const l = S.lists.find(x => x.id === b.dataset.delete);
      const d = U.modal(`<div class="dialog-body"><h2>Delete “${T.esc(l.title)}”?</h2><p class="muted">Every task in this list will be removed.</p>
        <div class="dialog-actions"><button class="btn btn-primary" id="yes">Delete list</button><button class="btn btn-outline" data-close>Cancel</button></div></div>`);
      d.querySelector("#yes").onclick = e => U.run(async () => { await T.deleteList(l.id); d.close(); U.toast("List deleted"); render(); }, e.currentTarget);
    });
  }

  function nameDialog(title, value, onSave) {
    const d = U.modal(`<form class="dialog-body"><h2>${title}</h2><div class="field"><label for="n">List name</label><input id="n" required value="${T.esc(value)}"></div>
      <div class="dialog-actions"><button class="btn btn-primary">Save</button><button type="button" class="btn btn-outline" data-close>Cancel</button></div></form>`);
    d.querySelector("form").onsubmit = e => { e.preventDefault(); const v = d.querySelector("#n").value.trim(); if (v) U.run(async () => { await onSave(v); d.close(); }, e.submitter); };
  }
  U.page({ render });
})();
