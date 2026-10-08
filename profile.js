/* Profile page: account, preferences, categories, Canvas */
(() => {
  const T = Tidy, U = T.ui, root = document.getElementById("main"), esc = T.esc;

  function deleteAccountDialog() {
    const d=U.modal(`<form class="dialog-body" aria-labelledby="delete-title">
      <h2 id="delete-title">Delete your account?</h2>
      <p class="muted">Your account, tasks, lists, categories, preferences and Canvas connection will be permanently deleted. This cannot be undone.</p>
      <div class="field"><label for="delete-confirm">Type DELETE to confirm</label><input id="delete-confirm" autocomplete="off" spellcheck="false" required></div>
      <p role="status" class="auth-status error"></p>
      <div class="dialog-actions"><button type="button" class="btn btn-outline" data-close>Keep account</button><button type="submit" class="btn btn-danger" disabled>Delete account</button></div>
    </form>`);
    const form=d.querySelector('form'), input=d.querySelector('input'), button=d.querySelector('[type=submit]'), status=d.querySelector('[role=status]');
    let busy=false;
    input.oninput=()=>{button.disabled=busy || input.value!=='DELETE';};
    d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    d.addEventListener('click',e=>{if(busy){e.stopImmediatePropagation();e.preventDefault();}},true);
    form.onsubmit=async e=>{
      e.preventDefault(); if(busy || input.value!=='DELETE')return;
      busy=true; button.disabled=true; input.disabled=true; status.textContent=''; button.textContent='Deleting…';
      try {
        const {data,error}=await window.tidyClient.functions.invoke('delete-account',{body:{confirmation:input.value}});
        if(error || !data?.deleted) throw new Error('Could not delete your account. Please try again. If this feature was just added, check that its Supabase setup is complete.');
        await window.tidyClient.auth.signOut({scope:'local'}).catch(()=>{});
        location.replace('index.html');
      } catch(error) {
        status.textContent=error.message; busy=false; input.disabled=false; button.disabled=input.value!=='DELETE'; button.textContent='Delete account';
      }
    };
  }

  function render() {
    const S = T.state, u = S.user, ws = S.prefs.weekStart;
    root.innerHTML = `<div class="container">
      <div class="page-head"><div><h1>Profile</h1><p>Your account, preferences, categories and Canvas connection.</p></div>
        <div class="head-actions"><button class="btn btn-outline" id="logout">Log out</button></div></div>
      <div class="two-col">
        <div class="col">
          <section class="card profile-card"><div class="avatar">${esc(u.first[0] || "")}${esc(u.last[0] || "")}</div>
            <h2>${esc(u.first)} ${esc(u.last)}</h2><p class="muted">${esc(u.email)}</p></section>
          <section class="card" id="canvas"><div class="section-head"><h2>Canvas</h2></div>
            <p class="muted">Not connected. Canvas assignment import is coming later.</p></section>
        </div>
        <div class="col">
          <section class="card"><div class="section-head"><h2>Account</h2></div>
            <form class="form" id="account">
              <div class="grid-2"><div class="field"><label for="a-first">First name</label><input id="a-first" required value="${esc(u.first)}"></div>
                <div class="field"><label for="a-last">Last name</label><input id="a-last" required value="${esc(u.last)}"></div></div>
              <div class="field"><label for="a-email">Email</label><input id="a-email" type="email" readonly aria-describedby="email-hint" value="${esc(u.email)}"><small id="email-hint">Your sign-in email.</small></div>
              <div class="field"><label for="a-user">Username</label><input id="a-user" required value="${esc(u.username)}"></div>
              <button class="btn btn-primary">Save account</button></form></section>
          <section class="card"><div class="section-head"><h2>Color theme</h2></div>
            <div class="theme-grid" role="radiogroup" aria-label="Color theme">${T.themes.map(([id, name]) => `<label class="theme-opt th-${id}"><input type="radio" name="theme" value="${id}"${S.prefs.theme === id ? " checked" : ""}><i></i>${name}</label>`).join("")}</div></section>
          <section class="card"><div class="section-head"><h2>Preferences</h2></div>
            <div class="form"><div class="field"><label for="p-week">Week starts on</label><select id="p-week">${U.options([["0", "Sunday"], ["1", "Monday"]], String(ws))}</select></div>
              <div class="switch-row"><div><label for="p-done">Show completed tasks in lists</label><small>Applies when you open the To-do page.</small></div>
                <span class="switch"><input id="p-done" type="checkbox"${S.prefs.showDone ? " checked" : ""}><span></span></span></div></div></section>
          <section class="card" id="categories"><div class="section-head"><h2>Categories</h2><span class="count">${S.categories.length}</span></div>
            <div class="cat-list">${S.categories.map(c => `<div class="cat-row t-${c.tone}"><span class="dot"></span><strong>${esc(c.name)}</strong>
              <small>${S.tasks.filter(t => t.categoryId === c.id).length} tasks</small>
              <button class="icon-btn" data-cat="${c.id}" aria-label="Edit ${esc(c.name)}">${U.icons.pencil}</button></div>`).join("") || '<p class="empty">No categories yet.</p>'}</div>
            <button class="btn btn-outline" id="add-cat">${U.icons.plus} Add category</button></section>
          <section class="card"><div class="section-head"><h2>Password</h2></div>
            <form class="form" id="password"><div class="grid-2"><div class="field"><label for="pw1">New password</label><input id="pw1" type="password" minlength="8" required autocomplete="new-password"></div>
              <div class="field"><label for="pw2">Repeat password</label><input id="pw2" type="password" minlength="8" required autocomplete="new-password"></div></div>
              <button class="btn btn-secondary">Update password</button></form></section>

          <section class="card delete-account-card"><div class="section-head"><h2>Delete account</h2></div>
            <p class="muted">Permanently remove your account and all your Tidy data.</p>
            <button type="button" class="btn btn-danger" id="delete-account">Delete account</button></section>
        </div></div></div>`;

    const $ = id => document.getElementById(id);
    $("delete-account").onclick=deleteAccountDialog;
    $("logout").onclick = e => U.run(async () => { await T.logout(); location.href = "index.html"; }, e.currentTarget);
    $("account").onsubmit = e => { e.preventDefault(); U.run(async () => {
      e.preventDefault();
      await T.updateUser({ first: $("a-first").value.trim(), last: $("a-last").value.trim(), email: $("a-email").value.trim(), username: $("a-user").value.trim() });
      document.querySelector(".site-header .avatar").textContent = (T.state.user.first[0] || "") + (T.state.user.last[0] || "");
      U.toast("Account saved"); render();
    }, e.submitter); };
    root.querySelectorAll("[name=theme]").forEach(r => r.onchange = () => U.run(async () => { try { await T.setPrefs({ theme: r.value }); U.toast("Theme updated"); } finally { render(); } }, r));
    $("p-week").onchange = e => U.run(async () => { try { await T.setPrefs({ weekStart: Number(e.target.value) }); U.toast("Preference saved"); } finally { render(); } }, e.currentTarget);
    $("p-done").onchange = e => U.run(async () => { try { await T.setPrefs({ showDone: e.target.checked }); U.toast("Preference saved"); } finally { render(); } }, e.currentTarget);
    $("add-cat").onclick = () => U.categoryDialog({ done: render });
    root.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => U.categoryDialog({ cat: S.categories.find(c => c.id === b.dataset.cat), done: render }));
    $("password").onsubmit = e => { e.preventDefault(); U.run(async () => {
      e.preventDefault();
      if ($("pw1").value !== $("pw2").value) { U.toast("Passwords don't match"); return; }
      await T.changePassword($("pw1").value); e.target.reset(); U.toast("Password updated");
    }, e.submitter); };
  }
  U.page({ render }).then(() => {
    if (location.hash === "#categories") document.getElementById("categories")?.scrollIntoView();
  });
})();
