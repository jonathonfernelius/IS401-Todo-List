/* Admin OKR dashboard. Admin access remains enforced by coursewise_is_admin + Supabase RLS/RPC. */
(() => {
  'use strict';
  const db = window.tidyClient;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const goals = [
    {id:'new-accounts', category:'Acquisition', title:'New accounts', icon:'◎', description:'Measure how many new student accounts join Coursewise.'},
    {id:'canvas-connection', category:'Acquisition', title:'Canvas connection rate', icon:'↗', description:'Track the share of accounts that connect Canvas.'},
    {id:'completed-per-day', category:'Retention', title:'Tasks completed per day', icon:'▤', description:'Track daily task completion and how consistently people use Coursewise.'},
    {id:'completed-overdue', category:'Retention', title:'Tasks completed vs. overdue', icon:'✓', description:'Compare tasks completed during the selected period with the overdue task backlog.'}
  ];
  let selected = 'completed-overdue';
  let busy = false;

  async function query(promise) {
    const {data,error} = await promise;
    if (error) throw new Error(error.message);
    return data;
  }

  function deny(message, login = false) {
    $('#dashboard').hidden = true;
    $('#access').hidden = false;
    $('#access').replaceChildren(document.createTextNode(message));
    if (login) {
      const link = document.createElement('a');
      link.href = 'index.html';
      link.textContent = ' Go to login';
      $('#access').append(link);
    }
  }

  function renderGoalLists() {
    for (const category of ['Acquisition','Retention']) {
      const mount = category === 'Acquisition' ? $('#acquisition-list') : $('#retention-list');
      mount.innerHTML = goals.filter(goal => goal.category === category).map(goal => `
        <button class="okr-choice" type="button" data-okr="${goal.id}" aria-current="${goal.id === selected}">
          <span class="okr-icon" aria-hidden="true">${goal.icon}</span>
          <span class="okr-choice-label">${esc(goal.title)}</span>
          <span class="okr-choice-arrow" aria-hidden="true">${goal.id === selected ? '›' : '›'}</span>
        </button>`).join('');
    }
  }

  function renderPlaceholder(goal) {
    $('#detail-category').textContent = goal.category.toUpperCase();
    $('#detail-title').textContent = goal.title;
    $('#detail-description').textContent = goal.description;
    $('#analytics-controls').hidden = true;
    $('#metrics').hidden = true;
    $('#chart-grid').hidden = true;
    $('#chart-footnote').hidden = true;
    $('#stats-error').hidden = true;
    let placeholder = $('#placeholder-detail');
    if (!placeholder) {
      placeholder = document.createElement('section');
      placeholder.id = 'placeholder-detail';
      placeholder.className = 'placeholder-detail';
      $('#okr-detail').append(placeholder);
    }
    placeholder.innerHTML = `<h3>Objective dashboard ready</h3><p>This OKR is set up in the tracker. Its metric definitions, database connection, and charts can be added when the team is ready to define its target.</p>`;
  }

  function showAnalytics() {
    $('#analytics-controls').hidden = false;
    $('#metrics').hidden = false;
    $('#chart-grid').hidden = false;
    $('#chart-footnote').hidden = false;
    $('#placeholder-detail')?.remove();
    $('#detail-category').textContent = 'RETENTION';
    $('#detail-title').textContent = 'Tasks completed vs. overdue';
    $('#detail-description').textContent = 'Compare tasks completed during the selected period with the overdue task backlog.';
  }

  function chartEmpty(message) {
    return `<div class="chart-empty">${esc(message)}</div>`;
  }

  function pathFor(points, key, bounds, maxValue) {
    const {left,top,width,height} = bounds;
    const count = Math.max(1, points.length - 1);
    return points.map((point,index) => {
      const x = left + width * index / count;
      const y = top + height - height * Math.max(0, Number(point[key]) || 0) / maxValue;
      return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  function renderLineChart(host, points, series, ratio = false) {
    if (!points.length) { host.innerHTML = chartEmpty('No activity in this range yet.'); return; }
    const width = 640, height = 242;
    const bounds = {left:48,top:15,width:width - 68,height:height - 58};
    const all = points.flatMap(point => series.map(item => Number(point[item.key]) || 0));
    const max = Math.max(1, Math.ceil(Math.max(...all) * 1.15));
    const grid = Array.from({length:5},(_,index) => {
      const value = Math.round(max * (4-index) / 4);
      const y = bounds.top + bounds.height * index / 4;
      return `<line class="gridline" x1="${bounds.left}" y1="${y}" x2="${bounds.left+bounds.width}" y2="${y}"/><text x="${bounds.left-8}" y="${y+3}" text-anchor="end">${ratio ? value : value.toLocaleString()}</text>`;
    }).join('');
    const labelIndexes = [...new Set([0,Math.round((points.length-1)*.25),Math.round((points.length-1)*.5),Math.round((points.length-1)*.75),points.length-1])];
    const labels = labelIndexes.map(index => {
      const x = bounds.left + bounds.width * index / Math.max(1,points.length-1);
      const label = new Date(`${points[index].date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'});
      return `<text x="${x}" y="${height-10}" text-anchor="middle">${esc(label)}</text>`;
    }).join('');
    const plots = series.map(item => {
      const path = pathFor(points,item.key,bounds,max);
      const circles = points.map((point,index) => {
        if (points.length > 36 && index % Math.ceil(points.length/24) !== 0 && index !== points.length-1) return '';
        const x = bounds.left + bounds.width * index / Math.max(1,points.length-1);
        const y = bounds.top + bounds.height - bounds.height * (Number(point[item.key]) || 0) / max;
        return `<circle class="${item.point}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"><title>${esc(new Date(`${point.date}T12:00:00`).toLocaleDateString())}: ${esc(item.label)} ${Number(point[item.key] || 0).toLocaleString()}</title></circle>`;
      }).join('');
      return `<path class="${item.line}" d="${path}"/>${circles}`;
    }).join('');
    const legend = series.length > 1 ? `<div class="chart-legend">${series.map(item => `<span class="legend-key"><i class="legend-dot ${item.key === 'overdue' ? 'overdue' : ''}"></i>${esc(item.label)}</span>`).join('')}</div>` : '';
    host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${ratio ? 'Completion to overdue ratio trend' : 'Completed task and overdue task trend'}"><title>${ratio ? 'Completion vs. overdue ratio' : 'Completed tasks and overdue backlog'}</title>${grid}<line class="axisline" x1="${bounds.left}" y1="${bounds.top+bounds.height}" x2="${bounds.left+bounds.width}" y2="${bounds.top+bounds.height}"/>${plots}${labels}</svg>${legend}`;
  }

  function renderSourceComparison(data) {
    const canvas = Number(data?.canvas?.completed || 0);
    const nonCanvas = Number(data?.non_canvas?.completed || 0);
    const total = canvas + nonCanvas;
    const canvasPct = total ? canvas / total * 100 : 0;
    $('#source-bars').innerHTML = `<span class="canvas-segment" style="width:${canvasPct}%" title="Canvas: ${canvas.toLocaleString()}"></span><span class="other-segment" style="width:${100-canvasPct}%" title="Non-Canvas: ${nonCanvas.toLocaleString()}"></span>`;
    $('#source-bars').setAttribute('aria-label',`Completed tasks: ${canvas.toLocaleString()} Canvas, ${nonCanvas.toLocaleString()} non-Canvas`);
    $('#source-summary').textContent = total ? `${canvas.toLocaleString()} Canvas · ${nonCanvas.toLocaleString()} non-Canvas completions` : 'No completions recorded in this range';
  }

  function renderData(data) {
    const completed = Number(data.completed_count || 0);
    const overdue = Number(data.overdue_count || 0);
    const ratio = data.ratio == null ? null : Number(data.ratio);
    $('#completed-value').textContent = completed.toLocaleString();
    $('#overdue-value').textContent = overdue.toLocaleString();
    $('#ratio-value').textContent = ratio == null || !Number.isFinite(ratio) ? '—' : `${ratio.toFixed(1)}:1`;
    $('#completed-change').textContent = `${Number(data.active_users_30d || 0).toLocaleString()} active users in the last 30 days`;
    renderSourceComparison(data.source_breakdown);
    const points = Array.isArray(data.chart) ? data.chart : [];
    renderLineChart($('#volume-chart'),points,[
      {key:'completed',label:'Completed',line:'completed-line',point:'completed-point'},
      {key:'overdue',label:'Overdue',line:'overdue-line',point:'overdue-point'}
    ]);
    renderLineChart($('#ratio-chart'),points,[
      {key:'ratio',label:'Ratio',line:'ratio-line',point:'ratio-point'}
    ],true);
    const source = document.querySelector('input[name="source"]:checked')?.value || 'all';
    const sourceLabel = source === 'canvas' ? 'Canvas tasks' : source === 'non_canvas' ? 'non-Canvas tasks' : 'all task sources';
    const active = $('#activity-filter').value === 'active' ? ' Active users are those who added or completed a task in the last 30 days.' : '';
    $('#chart-footnote').textContent = `Showing ${sourceLabel}. Completion events and historical overdue counts are available from ${new Date(data.tracking_started_at).toLocaleDateString()} onward.${active}`;
    const start = new Date(data.range_start).toLocaleDateString();
    $('#tracking-note').textContent = `Activity history starts ${new Date(data.tracking_started_at).toLocaleDateString()}. Selected range starts ${start}.`;
  }

  async function loadAnalytics() {
    if (busy || selected !== 'completed-overdue') return;
    busy = true;
    $('#refresh').disabled = true;
    $('#stats-error').hidden = true;
    try {
      // Keep the existing admin permission check and Supabase policy boundary.
      if (!await query(db.rpc('coursewise_is_admin'))) {
        deny('Admin access is required. Ask a project owner to grant your account the existing admin permission.');
        return;
      }
      const source = document.querySelector('input[name="source"]:checked')?.value || 'all';
      const days = Number($('#range-filter').value || 30);
      const activeOnly = $('#activity-filter').value === 'active';
      const data = await query(db.rpc('coursewise_admin_activity',{
        p_days:days,
        p_source:source,
        p_active_only:activeOnly
      }));
      if (!data || typeof data !== 'object') throw new Error('The analytics function returned an unexpected response.');
      renderData(data);
    } catch (error) {
      $('#stats-error').textContent = `Analytics unavailable: ${error.message} Apply supabase/admin-activity.sql in the Supabase SQL Editor, then refresh.`;
      $('#stats-error').hidden = false;
      $('#completed-value').textContent = '—';
      $('#overdue-value').textContent = '—';
      $('#ratio-value').textContent = '—';
      $('#volume-chart').innerHTML = chartEmpty('Analytics setup is required.');
      $('#ratio-chart').innerHTML = chartEmpty('Analytics setup is required.');
    } finally {
      busy = false;
      $('#refresh').disabled = false;
    }
  }

  function selectGoal(id) {
    const goal = goals.find(item => item.id === id);
    if (!goal) return;
    selected = id;
    renderGoalLists();
    if (id === 'completed-overdue') {
      showAnalytics();
      loadAnalytics();
    } else renderPlaceholder(goal);
  }

  $('#acquisition-list').addEventListener('click',event => {
    const button = event.target.closest('[data-okr]');
    if (button) selectGoal(button.dataset.okr);
  });
  $('#retention-list').addEventListener('click',event => {
    const button = event.target.closest('[data-okr]');
    if (button) selectGoal(button.dataset.okr);
  });
  $('#refresh').addEventListener('click',loadAnalytics);
  $('#range-filter').addEventListener('change',loadAnalytics);
  $('#activity-filter').addEventListener('change',loadAnalytics);
  document.querySelectorAll('input[name="source"]').forEach(input => input.addEventListener('change',loadAnalytics));

  async function start() {
    try {
      if (!db) throw new Error('Could not load Supabase. Check your connection and reload.');
      const {data,error} = await db.auth.getUser();
      if (error || !data.user) {
        deny('Sign in to Coursewise first, then return to admin.html.',true);
        return;
      }
      const authUser = data.user;
      const profile = await db.from('User').select('FirstName,LastName').eq('AuthUserID',authUser.id).maybeSingle();
      if (!profile.error && profile.data) {
        const initials = `${profile.data.FirstName?.[0] || ''}${profile.data.LastName?.[0] || ''}`.trim();
        if (initials) $('#user-avatar').textContent = initials;
      }
      db.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') deny('You have signed out. Sign in again to access this page.',true);
      });
      renderGoalLists();
      $('#dashboard').hidden = false;
      $('#access').hidden = true;
      await loadAnalytics();
    } catch (error) {
      deny(`Unable to load the admin workspace: ${error.message} If setup is incomplete, follow ADMIN-SETUP.md.`);
    }
  }
  start();
})();
