/* Admin OKR dashboards.
 * The browser requests aggregate results only. Supabase checks admin permission
 * inside each protected RPC, so private task rows and Canvas credentials never
 * need to be loaded into this page.
 */
(() => {
  'use strict';

  const db = window.tidyClient;
  const $ = selector => document.querySelector(selector);
  const number = value => Number(value || 0);
  const formatNumber = value => number(value).toLocaleString();

  const goals = [
    {
      id: 'new-accounts',
      category: 'Acquisition',
      title: 'New accounts',
      icon: '◎',
      description: 'Track account creation over time and compare it with the previous period.'
    },
    {
      id: 'canvas-connection',
      category: 'Acquisition',
      title: 'Canvas adoption and usage',
      icon: '↗',
      description: 'Measure accounts with imported Canvas assignments and how those assignments are used.'
    },
    {
      id: 'completed-per-day',
      category: 'Retention',
      title: 'Tasks completed per day',
      icon: '▤',
      description: 'See how many tasks and how many accounts complete work each day.'
    },
    {
      id: 'completed-overdue',
      category: 'Retention',
      title: 'Tasks completed vs. overdue',
      icon: '✓',
      description: 'Compare tasks completed during the selected period with the overdue task backlog.'
    }
  ];

  let selectedGoal = 'completed-overdue';
  let requestNumber = 0;

  // Unwrap Supabase responses consistently and keep database errors readable.
  async function getData(request) {
    const result = await request;
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function denyAccess(message, showLoginLink = false) {
    requestNumber += 1;
    $('#dashboard').hidden = true;
    $('#access').hidden = false;
    $('#access').replaceChildren(document.createTextNode(message));

    if (showLoginLink) {
      const loginLink = document.createElement('a');
      loginLink.href = 'index.html';
      loginLink.textContent = ' Go to login';
      $('#access').append(loginLink);
    }
  }

  function showError(message) {
    const error = $('#stats-error');
    error.textContent = message;
    error.hidden = false;
  }

  function renderGoalLists() {
    ['Acquisition', 'Retention'].forEach(category => {
      const destination = category === 'Acquisition'
        ? $('#acquisition-list')
        : $('#retention-list');

      destination.innerHTML = goals
        .filter(goal => goal.category === category)
        .map(goal => {
          const active = goal.id === selectedGoal;
          return [
            '<button class="okr-choice" type="button" data-okr="',
            goal.id,
            '" aria-current="',
            active,
            '">',
            '<span class="okr-icon" aria-hidden="true">',
            escapeHtml(goal.icon),
            '</span>',
            '<span class="okr-choice-label">',
            escapeHtml(goal.title),
            '</span>',
            '<span class="okr-choice-arrow" aria-hidden="true">›</span>',
            '</button>'
          ].join('');
        })
        .join('');
    });
  }

  function updateGoalView(goal) {
    $('#detail-category').textContent = goal.category.toUpperCase();
    $('#detail-title').textContent = goal.title;
    $('#detail-description').textContent = goal.description;
    $('#stats-error').hidden = true;

    document.querySelectorAll('.analytics-panel').forEach(panel => {
      panel.hidden = panel.id !== 'panel-' + goal.id;
    });

    // Task-source filters apply to task-focused retention goals only.
    const taskGoal = goal.id === 'completed-overdue' || goal.id === 'completed-per-day';
    $('#source-filter').hidden = !taskGoal;
    $('#activity-filter-field').hidden = !taskGoal;

    const definitions = {
      'completed-overdue': 'Overdue means an incomplete task past its due date. Date-only tasks become overdue the next day; tasks with a due time become overdue after that time. Active users added or completed a task in the last 30 days.',
      'completed-per-day': 'A daily completer is a registered account that completed at least one task that day. Daily completion rate divides daily completers by accounts registered by that day. The active-user filter uses task additions or completions in the last 30 days.',
      'new-accounts': 'New accounts are counted using the existing UserCreationDate field. Growth compares this range with the previous period of the same length.',
      'canvas-connection': 'Canvas adoption is estimated from accounts with at least one imported Canvas assignment on record. This confirms Canvas use; it does not count a connection that has not imported an assignment.'
    };
    $('#definition-note').textContent = definitions[goal.id];
  }

  function selectedFilters() {
    return {
      days: Number($('#range-filter').value || 30),
      source: document.querySelector('input[name="source"]:checked')?.value || 'all',
      activeOnly: $('#activity-filter').value === 'active'
    };
  }

  function chartEmpty(message) {
    return '<div class="chart-empty">' + escapeHtml(message) + '</div>';
  }

  function linePath(points, seriesKey, bounds, maxValue) {
    const count = Math.max(1, points.length - 1);
    return points.map((point, index) => {
      const x = bounds.left + bounds.width * index / count;
      const value = Math.max(0, number(point[seriesKey]));
      const y = bounds.top + bounds.height - bounds.height * value / maxValue;
      return (index ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  }

  // Draw lightweight SVG charts in the page so the dashboards need no chart CDN.
  function renderLineChart(host, points, series, options = {}) {
    if (!host) return;
    if (!Array.isArray(points) || points.length === 0) {
      host.innerHTML = chartEmpty('No activity in this range yet.');
      return;
    }

    const width = 640;
    const height = 242;
    const bounds = {
      left: 52,
      top: 16,
      width: width - 72,
      height: height - 60
    };

    const values = points.flatMap(point => series.map(item => number(point[item.key])));
    const largestValue = Math.max(0, ...values);
    const maxValue = options.percent
      ? 100
      : Math.max(1, Math.ceil(largestValue * 1.15));

    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = maxValue * (4 - index) / 4;
      const y = bounds.top + bounds.height * index / 4;
      const label = options.percent
        ? Math.round(value) + '%'
        : Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
      return '<line class="gridline" x1="' + bounds.left + '" y1="' + y +
        '" x2="' + (bounds.left + bounds.width) + '" y2="' + y + '"></line>' +
        '<text x="' + (bounds.left - 9) + '" y="' + (y + 3) +
        '" text-anchor="end">' + label + '</text>';
    }).join('');

    const labelIndexes = [...new Set([
      0,
      Math.round((points.length - 1) * .25),
      Math.round((points.length - 1) * .5),
      Math.round((points.length - 1) * .75),
      points.length - 1
    ])];

    const dateLabel = index => {
      const date = new Date(String(points[index].date) + 'T12:00:00');
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const labels = labelIndexes.map(index => {
      const x = bounds.left + bounds.width * index / Math.max(1, points.length - 1);
      return '<text x="' + x + '" y="' + (height - 10) +
        '" text-anchor="middle">' + escapeHtml(dateLabel(index)) + '</text>';
    }).join('');

    const plots = series.map(item => {
      const path = linePath(points, item.key, bounds, maxValue);
      const pointMarkup = points.map((point, index) => {
        const markerEvery = Math.max(1, Math.ceil(points.length / 24));
        if (index % markerEvery !== 0 && index !== points.length - 1) return '';

        const x = bounds.left + bounds.width * index / Math.max(1, points.length - 1);
        const value = Math.max(0, number(point[item.key]));
        const y = bounds.top + bounds.height - bounds.height * value / maxValue;
        const title = dateLabel(index) + ': ' + item.label + ' ' +
          (options.percent ? value.toFixed(1) + '%' : value.toLocaleString());

        return '<circle class="' + item.point + '" cx="' + x.toFixed(1) +
          '" cy="' + y.toFixed(1) + '" r="3"><title>' +
          escapeHtml(title) + '</title></circle>';
      }).join('');

      return '<path class="' + item.line + '" d="' + path + '"></path>' + pointMarkup;
    }).join('');

    const legend = series.length > 1
      ? '<div class="chart-legend">' + series.map(item =>
        '<span class="legend-key"><i class="legend-dot ' +
        escapeHtml(item.legendClass || '') + '"></i>' +
        escapeHtml(item.label) + '</span>'
      ).join('') + '</div>'
      : '';

    const title = options.title || series.map(item => item.label).join(' and ');
    host.innerHTML =
      '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' +
      escapeHtml(title) + '">' +
      '<title>' + escapeHtml(title) + '</title>' +
      grid +
      '<line class="axisline" x1="' + bounds.left + '" y1="' +
      (bounds.top + bounds.height) + '" x2="' +
      (bounds.left + bounds.width) + '" y2="' +
      (bounds.top + bounds.height) + '"></line>' +
      plots + labels +
      '</svg>' + legend;
  }

  function updateTrackingNote(data) {
    const started = data.tracking_started_at
      ? new Date(data.tracking_started_at).toLocaleDateString()
      : 'the start of tracking';
    const rangeStart = data.range_start
      ? new Date(data.range_start).toLocaleDateString()
      : 'the selected range';
    $('#tracking-note').textContent =
      'Task history starts ' + started + '. This range starts ' + rangeStart + '.';
  }

  function renderSourceComparison(data) {
    const canvasCount = number(data?.canvas?.completed);
    const otherCount = number(data?.non_canvas?.completed);
    const total = canvasCount + otherCount;
    const canvasPercent = total ? canvasCount / total * 100 : 0;

    $('#source-bars').innerHTML =
      '<span class="canvas-segment" style="width:' + canvasPercent +
      '%" title="Canvas: ' + formatNumber(canvasCount) + '"></span>' +
      '<span class="other-segment" style="width:' + (100 - canvasPercent) +
      '%" title="Non-Canvas: ' + formatNumber(otherCount) + '"></span>';
    $('#source-bars').setAttribute(
      'aria-label',
      'Completed tasks: ' + formatNumber(canvasCount) + ' Canvas, ' +
        formatNumber(otherCount) + ' non-Canvas'
    );
    $('#source-summary').textContent = total
      ? formatNumber(canvasCount) + ' Canvas · ' + formatNumber(otherCount) +
        ' non-Canvas completions'
      : 'No completions recorded in this range';
  }

  function renderCompletedOverdue(data) {
    const completed = number(data.completed_count);
    const overdue = number(data.overdue_count);
    const ratio = data.ratio == null ? null : Number(data.ratio);

    $('#completed-value').textContent = formatNumber(completed);
    $('#overdue-value').textContent = formatNumber(overdue);
    $('#ratio-value').textContent = ratio == null || !Number.isFinite(ratio)
      ? '—'
      : ratio.toFixed(1) + ':1';
    $('#completed-change').textContent =
      formatNumber(data.active_users_30d) + ' active accounts in the last 30 days';

    renderSourceComparison(data.source_breakdown);
    renderLineChart($('#volume-chart'), data.chart, [
      { key: 'completed', label: 'Completed', line: 'completed-line', point: 'completed-point' },
      { key: 'overdue', label: 'Overdue', line: 'overdue-line', point: 'overdue-point', legendClass: 'overdue' }
    ], { title: 'Completed tasks and overdue backlog' });
    renderLineChart($('#ratio-chart'), data.chart, [
      { key: 'ratio', label: 'Ratio', line: 'ratio-line', point: 'ratio-point' }
    ], { title: 'Completion to overdue ratio' });

    const filters = selectedFilters();
    const sourceName = filters.source === 'canvas'
      ? 'Canvas tasks'
      : filters.source === 'non_canvas' ? 'non-Canvas tasks' : 'all task sources';
    const activeNote = filters.activeOnly
      ? ' The user filter includes accounts that added or completed a task in the last 30 days.'
      : '';
    $('#completed-footnote').textContent =
      'Showing ' + sourceName + '. Event history is available from ' +
      new Date(data.tracking_started_at).toLocaleDateString() + '.' + activeNote;
    updateTrackingNote(data);
  }

  function renderDailyCompletions(data) {
    const metrics = data.daily_tasks;
    $('#daily-completions-value').textContent = formatNumber(metrics.completed_count);
    $('#daily-average-tasks-value').textContent =
      number(metrics.average_completions_per_day).toFixed(1);
    $('#daily-completers-value').textContent =
      number(metrics.average_completing_users).toFixed(1);
    $('#daily-rate-value').textContent =
      number(metrics.average_completion_rate).toFixed(1) + '%';

    renderLineChart($('#daily-volume-chart'), metrics.chart, [
      { key: 'completed', label: 'Tasks completed', line: 'completed-line', point: 'completed-point' },
      { key: 'completing_users', label: 'People completing', line: 'users-line', point: 'users-point' }
    ], { title: 'Tasks completed and unique people completing each day' });
    renderLineChart($('#daily-rate-chart'), metrics.chart, [
      { key: 'completion_rate', label: 'Accounts completing', line: 'rate-line', point: 'rate-point' }
    ], { title: 'Share of registered accounts completing each day', percent: true });

    const filters = selectedFilters();
    const sourceName = filters.source === 'canvas'
      ? 'Canvas tasks'
      : filters.source === 'non_canvas' ? 'non-Canvas tasks' : 'all task sources';
    const activeNote = filters.activeOnly
      ? ' Limited to accounts active in the last 30 days.'
      : '';
    $('#daily-footnote').textContent =
      'Showing ' + sourceName + '. Percentages use the registered accounts on each day.' +
      ' Daily completion records begin ' +
      new Date(data.tracking_started_at).toLocaleDateString() + '.' + activeNote;
    updateTrackingNote(data);
  }

  function renderNewAccounts(data) {
    const accounts = data.accounts;
    $('#new-accounts-value').textContent = formatNumber(accounts.created_count);
    $('#new-accounts-change').textContent =
      formatNumber(accounts.previous_period_count) + ' new accounts in the previous equal-length period';
    $('#total-accounts-value').textContent = formatNumber(accounts.total_count);

    if (accounts.growth_percent == null) {
      $('#account-growth-value').textContent = accounts.created_count > 0 ? 'New' : '—';
    } else {
      const growth = Number(accounts.growth_percent);
      $('#account-growth-value').textContent =
        (growth > 0 ? '+' : '') + growth.toFixed(1) + '%';
    }

    renderLineChart($('#new-accounts-chart'), accounts.chart, [
      { key: 'new_accounts', label: 'New accounts', line: 'accounts-line', point: 'accounts-point' }
    ], { title: 'New accounts created over time' });
    renderLineChart($('#total-accounts-chart'), accounts.chart, [
      { key: 'total_accounts', label: 'Registered accounts', line: 'total-line', point: 'total-point' }
    ], { title: 'Total registered accounts over time' });

    $('#accounts-footnote').textContent =
      'Account creation is read from the existing UserCreationDate field. ' +
      'The previous period contains the same number of days as this selection.';
    updateTrackingNote(data);
  }

  function renderCanvasAdoption(data) {
    const canvas = data.canvas;
    $('#canvas-users-value').textContent = formatNumber(canvas.accounts_with_assignments);
    $('#canvas-rate-value').textContent =
      number(canvas.adoption_percent).toFixed(1) + '%';
    $('#canvas-imports-value').textContent = formatNumber(canvas.import_count);
    $('#canvas-completions-value').textContent =
      formatNumber(canvas.completion_count);

    renderLineChart($('#canvas-chart'), canvas.chart, [
      { key: 'importing_accounts', label: 'Accounts importing', line: 'importers-line', point: 'importers-point' },
      {
        key: 'completed_assignments',
        label: 'Assignments completed',
        line: 'canvas-completion-line',
        point: 'canvas-completion-point',
        legendClass: 'canvas-completion'
      }
    ], { title: 'Accounts importing and completing Canvas assignments' });

    $('#canvas-footnote').textContent =
      'Canvas adoption is based on accounts with at least one Canvas assignment still on record. ' +
      'Imports and completion events in the trend are available from ' +
      new Date(data.tracking_started_at).toLocaleDateString() + '. ' +
      'The current Canvas connection status is stored by a server function and is not exposed ' +
      'as a database field in this project.';
    updateTrackingNote(data);
  }

  function clearCurrentMetrics() {
    const chartHosts = {
      'completed-overdue': ['#volume-chart', '#ratio-chart'],
      'completed-per-day': ['#daily-volume-chart', '#daily-rate-chart'],
      'new-accounts': ['#new-accounts-chart', '#total-accounts-chart'],
      'canvas-connection': ['#canvas-chart']
    };

    (chartHosts[selectedGoal] || []).forEach(selector => {
      $(selector).innerHTML = chartEmpty('Analytics setup is required.');
    });

    document.querySelectorAll('#panel-' + selectedGoal + ' strong').forEach(value => {
      value.textContent = '—';
    });
  }

  // Read one protected aggregate at a time; stale responses are ignored if an
  // administrator switches objectives while a request is still in flight.
  async function loadSelectedAnalytics() {
    const thisRequest = ++requestNumber;
    const goalId = selectedGoal;
    const filters = selectedFilters();

    $('#refresh').disabled = true;
    $('#stats-error').hidden = true;

    try {
      if (!db) throw new Error('Supabase did not load. Check your connection and reload.');

      // Keep the existing permission check, then rely on each RPC's own admin check.
      const isAdmin = await getData(db.rpc('coursewise_is_admin'));
      if (thisRequest !== requestNumber) return;
      if (!isAdmin) {
        denyAccess('Admin access is required. Ask a project owner to grant your account the existing admin permission.');
        return;
      }

      if (goalId === 'completed-overdue') {
        const activity = await getData(db.rpc('coursewise_admin_activity', {
          p_days: filters.days,
          p_source: filters.source,
          p_active_only: filters.activeOnly
        }));
        if (thisRequest === requestNumber) renderCompletedOverdue(activity);
        return;
      }

      const overview = await getData(db.rpc('coursewise_admin_okr_analytics', {
        p_days: filters.days,
        p_source: filters.source,
        p_active_only: filters.activeOnly
      }));
      if (thisRequest !== requestNumber) return;

      if (goalId === 'completed-per-day') renderDailyCompletions(overview);
      if (goalId === 'new-accounts') renderNewAccounts(overview);
      if (goalId === 'canvas-connection') renderCanvasAdoption(overview);
    } catch (error) {
      if (thisRequest !== requestNumber) return;
      clearCurrentMetrics();
      showError(
        'Analytics unavailable: ' + error.message +
        ' Apply supabase/admin-okr-analytics.sql in the Supabase SQL Editor. ' +
        'The existing task dashboards also need supabase/admin-activity.sql.'
      );
    } finally {
      if (thisRequest === requestNumber) $('#refresh').disabled = false;
    }
  }

  function selectGoal(goalId) {
    const goal = goals.find(item => item.id === goalId);
    if (!goal) return;

    selectedGoal = goalId;
    renderGoalLists();
    updateGoalView(goal);
    loadSelectedAnalytics();
  }

  function registerEvents() {
    ['#acquisition-list', '#retention-list'].forEach(selector => {
      $(selector).addEventListener('click', event => {
        const button = event.target.closest('[data-okr]');
        if (button) selectGoal(button.dataset.okr);
      });
    });

    $('#refresh').addEventListener('click', loadSelectedAnalytics);
    $('#range-filter').addEventListener('change', loadSelectedAnalytics);
    $('#activity-filter').addEventListener('change', loadSelectedAnalytics);
    document.querySelectorAll('input[name="source"]').forEach(input => {
      input.addEventListener('change', loadSelectedAnalytics);
    });
  }

  async function start() {
    try {
      if (!db) throw new Error('Could not load Supabase. Check your connection and reload.');

      const userResult = await db.auth.getUser();
      if (userResult.error || !userResult.data.user) {
        denyAccess('Sign in to Coursewise first, then return to admin.html.', true);
        return;
      }

      // Personal profile lookup is limited to the currently signed-in account.
      const authUser = userResult.data.user;
      const profile = await db.from('User')
        .select('FirstName,LastName')
        .eq('AuthUserID', authUser.id)
        .maybeSingle();

      if (!profile.error && profile.data) {
        const initials =
          (profile.data.FirstName?.[0] || '') +
          (profile.data.LastName?.[0] || '');
        if (initials.trim()) $('#user-avatar').textContent = initials.trim();
      }

      db.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') {
          denyAccess('You have signed out. Sign in again to access this page.', true);
        }
      });

      registerEvents();
      renderGoalLists();
      updateGoalView(goals.find(goal => goal.id === selectedGoal));
      $('#dashboard').hidden = false;
      $('#access').hidden = true;
      await loadSelectedAnalytics();
    } catch (error) {
      denyAccess(
        'Unable to load the admin workspace: ' + error.message +
        ' If setup is incomplete, follow ADMIN-SETUP.md.'
      );
    }
  }

  start();
})();
