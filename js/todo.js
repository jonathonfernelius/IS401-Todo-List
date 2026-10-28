/* To-do page */
(() => {
  const T = Tidy, U = T.ui, root = document.getElementById("main");
  const collapsed = new Set(); let showDone, orderSaving = false, taskOrderSaving = false;

  function render() {
    const S = T.state; if (showDone === undefined) showDone = !!S.prefs.showDone;
    root.innerHTML = `<div class="container">
      <div class="page-head"><div><h1>To-do</h1><p>Drag the grips to reorder lists and tasks or move tasks between lists.</p></div>
        <div class="head-actions"><button class="pill-btn" id="done-toggle">${showDone ? "Hide done" : "Show done"}</button>
        <button class="btn btn-outline" id="new-list">${U.icons.plus} New list</button>
        <button class="btn btn-primary" id="add">${U.icons.plus} Add task</button></div></div>
      <div class="lists">${S.lists.map(l => {
        const items = S.tasks.filter(t => t.listId === l.id && (showDone || !t.done)), open = !collapsed.has(l.id);
        return `<section class="card list-card" data-list-id="${T.esc(l.id)}"><div class="list-head">
          <button class="list-drag" draggable="true" data-drag-list="${T.esc(l.id)}" aria-label="Reorder ${T.esc(l.title)}" aria-keyshortcuts="ArrowUp ArrowDown" title="Drag to reorder; use arrow keys to move">${U.icons.grip}</button>
          <button class="list-toggle" data-collapse="${l.id}" aria-expanded="${open}">${U.icons.down}<h2>${T.esc(l.title)}</h2><span class="count">${items.length}</span></button>
          <button class="icon-btn" data-rename="${l.id}" aria-label="Rename ${T.esc(l.title)}">${U.icons.pencil}</button>
          <button class="icon-btn danger" data-delete="${l.id}" aria-label="Delete ${T.esc(l.title)}">${U.icons.trash}</button></div>
          ${open ? `<div class="task-list" data-task-list="${T.esc(l.id)}">${items.length ? items.map(t => U.taskRow(t, { draggable: true })).join("") : '<p class="empty">No tasks in this list.</p>'}</div>` : ""}</section>`;
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
    const listContainer = root.querySelector(".lists");
    let draggedId = null, initialOrder = [], dropped = false;
    listContainer.querySelectorAll("[data-drag-list]").forEach(handle => {
      handle.addEventListener("dragstart", e => {
        draggedId = handle.dataset.dragList;
        initialOrder = [...listContainer.querySelectorAll("[data-list-id]")].map(card => card.dataset.listId);
        dropped = false;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", draggedId);
        handle.closest(".list-card").classList.add("is-dragging");
      });
      handle.addEventListener("keydown", e => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const ids = S.lists.map(list => list.id);
        const index = ids.indexOf(handle.dataset.dragList), next = index + (e.key === "ArrowUp" ? -1 : 1);
        if (next < 0 || next >= ids.length) return;
        [ids[index], ids[next]] = [ids[next], ids[index]];
        persistListOrder(ids);
      });
    });
    listContainer.addEventListener("dragover", e => {
      const target = e.target.closest(".list-card[data-list-id]");
      if (!draggedId || !target) return;
      e.preventDefault();
      const dragged = [...listContainer.querySelectorAll("[data-list-id]")].find(card => card.dataset.listId === draggedId);
      if (dragged === target) return;
      const bounds = target.getBoundingClientRect();
      listContainer.insertBefore(dragged, e.clientY > bounds.top + bounds.height / 2 ? target.nextSibling : target);
      e.dataTransfer.dropEffect = "move";
    });
    listContainer.addEventListener("drop", e => {
      if (!draggedId || !e.target.closest(".list-card[data-list-id]")) return;
      e.preventDefault();
      const ids = [...listContainer.querySelectorAll("[data-list-id]")].map(card => card.dataset.listId);
      dropped = true;
      if (ids.some((id, index) => id !== initialOrder[index])) persistListOrder(ids);
    });
    listContainer.addEventListener("dragend", e => {
      e.target.closest(".list-card")?.classList.remove("is-dragging");
      if (!dropped && draggedId) render();
      draggedId = null;
    });

    let draggedTaskId = null, draggedTaskSourceId = null, taskDropped = false;
    listContainer.querySelectorAll("[data-drag-task]").forEach(handle => {
      handle.addEventListener("dragstart", e => {
        if (taskOrderSaving) { e.preventDefault(); return; }
        e.stopPropagation();
        draggedTaskId = handle.dataset.dragTask;
        draggedTaskSourceId = handle.closest(".list-card").dataset.listId;
        taskDropped = false;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", draggedTaskId);
        handle.closest(".task").classList.add("is-dragging");
      });
      handle.addEventListener("keydown", e => {
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
        e.preventDefault();
        if (taskOrderSaving) return;
        moveTaskWithKeyboard(handle.dataset.dragTask, e.key);
      });
    });
    listContainer.addEventListener("dragover", e => {
      if (!draggedTaskId) return;
      const card = e.target.closest(".list-card[data-list-id]");
      if (!card) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      listContainer.querySelectorAll(".list-card.is-drop-target").forEach(el => el.classList.remove("is-drop-target"));
      card.classList.add("is-drop-target");
      if (card.dataset.listId !== draggedTaskSourceId) return;
      const target = e.target.closest(".task[data-task-id]");
      if (!target || target.dataset.taskId === draggedTaskId) return;
      const dragged = [...listContainer.querySelectorAll(".task[data-task-id]")].find(row => row.dataset.taskId === draggedTaskId);
      const bounds = target.getBoundingClientRect();
      target.parentElement.insertBefore(dragged, e.clientY > bounds.top + bounds.height / 2 ? target.nextSibling : target);
    });
    listContainer.addEventListener("drop", e => {
      if (!draggedTaskId) return;
      const card = e.target.closest(".list-card[data-list-id]");
      if (!card) return;
      e.preventDefault();
      taskDropped = true;
      const targetListId = card.dataset.listId;
      const targetVisible = [...card.querySelectorAll(".task[data-task-id]")]
        .map(row => row.dataset.taskId)
        .filter(id => id !== draggedTaskId);
      if (targetListId !== draggedTaskSourceId) {
        const target = e.target.closest(".task[data-task-id]");
        if (target && target.dataset.taskId !== draggedTaskId) {
          const index = targetVisible.indexOf(target.dataset.taskId);
          const after = e.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
          targetVisible.splice(index + (after ? 1 : 0), 0, draggedTaskId);
        } else targetVisible.push(draggedTaskId);
      } else {
        targetVisible.push(draggedTaskId);
        targetVisible.splice(0, targetVisible.length, ...[...card.querySelectorAll(".task[data-task-id]")].map(row => row.dataset.taskId));
      }
      const targetIds = withHiddenTasks(targetListId, targetVisible, draggedTaskId);
      const sourceCard = [...listContainer.querySelectorAll(".list-card")]
        .find(item => item.dataset.listId === draggedTaskSourceId);
      const sourceIds = targetListId === draggedTaskSourceId ? [] : withHiddenTasks(
        draggedTaskSourceId,
        [...sourceCard.querySelectorAll(".task[data-task-id]")]
          .map(row => row.dataset.taskId).filter(id => id !== draggedTaskId),
        draggedTaskId
      );
      const oldTargetIds = T.state.tasks.filter(task => task.listId === targetListId).map(task => task.id);
      if (targetListId !== draggedTaskSourceId || targetIds.some((id, index) => id !== oldTargetIds[index])) {
        persistTaskOrder(draggedTaskId, targetListId, targetIds, sourceIds);
      }
    });
    listContainer.addEventListener("dragend", e => {
      if (!draggedTaskId) return;
      e.target.closest(".task")?.classList.remove("is-dragging");
      listContainer.querySelectorAll(".list-card.is-drop-target").forEach(el => el.classList.remove("is-drop-target"));
      if (!taskDropped) render();
      draggedTaskId = null;
      draggedTaskSourceId = null;
    });
  }

  function withHiddenTasks(listId, visibleIds, movedId) {
    const existing = T.state.tasks.filter(task => task.listId === listId && task.id !== movedId);
    let visibleIndex = 0;
    const ordered = [];
    for (const task of existing) {
      if (!showDone && task.done) ordered.push(task.id);
      else if (visibleIndex < visibleIds.length) ordered.push(visibleIds[visibleIndex++]);
    }
    ordered.push(...visibleIds.slice(visibleIndex));
    return ordered;
  }

  function moveTaskWithKeyboard(taskId, key) {
    const task = T.state.tasks.find(item => item.id === taskId);
    if (!task) return;
    const listIds = T.state.lists.map(list => list.id), listIndex = listIds.indexOf(task.listId);
    if (key === "ArrowLeft" || key === "ArrowRight") {
      const nextListId = listIds[listIndex + (key === "ArrowLeft" ? -1 : 1)];
      if (!nextListId) return;
      const targetIds = withHiddenTasks(nextListId, [
        ...T.state.tasks.filter(item => item.listId === nextListId && (showDone || !item.done)).map(item => item.id),
        taskId
      ], taskId);
      const sourceIds = withHiddenTasks(task.listId,
        T.state.tasks.filter(item => item.listId === task.listId && (showDone || !item.done) && item.id !== taskId).map(item => item.id),
        taskId);
      persistTaskOrder(taskId, nextListId, targetIds, sourceIds, true);
      return;
    }
    const visibleIds = T.state.tasks
      .filter(item => item.listId === task.listId && (showDone || !item.done))
      .map(item => item.id);
    const index = visibleIds.indexOf(taskId), next = index + (key === "ArrowUp" ? -1 : 1);
    if (next < 0 || next >= visibleIds.length) return;
    [visibleIds[index], visibleIds[next]] = [visibleIds[next], visibleIds[index]];
    persistTaskOrder(taskId, task.listId, withHiddenTasks(task.listId, visibleIds, null), [], true);
  }

  function persistTaskOrder(taskId, targetListId, targetIds, sourceIds, restoreFocus = false) {
    if (taskOrderSaving) return;
    taskOrderSaving = true;
    U.run(async () => {
      try { await T.reorderTasks(taskId, targetListId, targetIds, sourceIds); }
      catch (error) { render(); if (restoreFocus) focusTaskHandle(taskId); throw error; }
      render();
      if (restoreFocus) focusTaskHandle(taskId);
    }).finally(() => { taskOrderSaving = false; });
  }

  function focusTaskHandle(taskId) {
    [...root.querySelectorAll("[data-drag-task]")].find(handle => handle.dataset.dragTask === taskId)?.focus();
  }

  function persistListOrder(ids) {
    if (orderSaving) return;
    orderSaving = true;
    U.run(async () => {
      try { await T.reorderLists(ids); }
      catch (error) { render(); throw error; }
      render();
    }).finally(() => { orderSaving = false; });
  }

  function nameDialog(title, value, onSave) {
    const d = U.modal(`<form class="dialog-body"><h2>${title}</h2><div class="field"><label for="n">List name</label><input id="n" required value="${T.esc(value)}"></div>
      <div class="dialog-actions"><button class="btn btn-primary">Save</button><button type="button" class="btn btn-outline" data-close>Cancel</button></div></form>`);
    d.querySelector("form").onsubmit = e => { e.preventDefault(); const v = d.querySelector("#n").value.trim(); if (v) U.run(async () => { await onSave(v); d.close(); }, e.submitter); };
  }
  U.page({ render });
})();
