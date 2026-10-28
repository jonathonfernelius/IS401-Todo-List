
/*
 * Coursewise Canvas Integration
 * Connection, preview, importing, and saved selections.
 */

(() => {
  "use strict";

  const client = window.tidyClient;
  let connected = false;
  let currentSection = null;
  let previewData = null;

  // Choices remain available while this page is open.
  const choices = new Map();
  const coursePreferences = new Map();

  const style = document.createElement("style");
  style.textContent = `
    .cw-connection-status {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .cw-status-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #218668;
      flex-shrink: 0;
    }

    .cw-disconnect-action {
      margin-top: 20px;
    }

    .cw-disconnect-action .btn {
      font-size: 14px;
    }

    #cw-canvas-preview input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      width: 21px;
      height: 21px;
      min-width: 21px;
      border: 2px solid #d8b5c3;
      border-radius: 7px;
      background: white;
      cursor: pointer;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }
    #cw-canvas-preview input[type="checkbox"]:checked {
      background: var(--primary, #a35b79);
      border-color: var(--primary, #a35b79);
    }
    #cw-canvas-preview input[type="checkbox"]:checked::after {
      content: "✓";
      color: white;
      font-size: 14px;
      font-weight: bold;
    }
    #cw-canvas-preview input[type="checkbox"]:focus-visible {
      outline: 3px solid #eec3d6;
      outline-offset: 3px;
    }
    .cw-event-row {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 6px;
      cursor: pointer;
    }
    .cw-event-row:hover {
      background: rgba(163, 91, 121, 0.05);
      border-radius: 8px;
    }
    .cw-course {
      padding: 12px;
      border: 1px solid var(--border, #e5e5e5);
      border-radius: 12px;
      margin-top: 12px;
    }
    .cw-course summary {
      cursor: pointer;
      font-weight: 600;
    }
    .cw-course-settings {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin: 14px 0;
    }
    .cw-course-settings label {
      flex: 1;
      min-width: 145px;
      font-size: 13px;
    }
    .cw-course-settings select {
      display: block;
      width: 100%;
      margin-top: 5px;
      padding: 9px;
      border: 1px solid var(--border, #ddd);
      border-radius: 8px;
      background: var(--surface, white);
      color: inherit;
    }
    .cw-status {
      font-size: 12px;
      opacity: .7;
      margin-top: 3px;
    }
    .cw-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 20px;
    }
  `;
  document.head.appendChild(style);

  async function callFunction(name, body) {
    if (!client) {
      throw new Error("Supabase is not available.");
    }

    const { data: sessionData } =
      await client.auth.getSession();

    if (!sessionData?.session) {
      throw new Error("Please sign in again.");
    }

    const { data, error } =
      await client.functions.invoke(name, { body });

    if (error) {
      let explanation = error.message;

      try {
        const response = await error.context?.json();
        explanation = response?.error || explanation;
      } catch {
        // Keep the original error message.
      }

      throw new Error(explanation || "Request failed.");
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data || {};
  }

  function callCanvas(action, feedUrl) {
    const body = { action };

    if (action === "connect") {
      body.feedUrl = feedUrl;
    }

    return callFunction("canvas-connect", body);
  }

  function message(section, text, isError = false) {
    const target =
      section.querySelector("#cw-canvas-message");

    if (target) {
      target.textContent = text;
      target.style.color =
        isError ? "#b42318" : "";
    }
  }

  function element(tag, text, className = "") {
    const result = document.createElement(tag);
    result.textContent = text;
    result.className = className;
    return result;
  }

  // Creates a dropdown using Coursewise's real data.
  function dropdown(title, options, value, onChange) {
    const wrapper = document.createElement("label");
    wrapper.textContent = title;

    const select = document.createElement("select");

    for (const option of options) {
      const node = document.createElement("option");
      node.value = String(option.value);
      node.textContent = option.label;
      select.appendChild(node);
    }

    select.value = value || "";
    select.addEventListener("change", () => {
      onChange(select.value);
    });

    wrapper.appendChild(select);
    return wrapper;
  }

  // Keep selection and organization choices together.
  function getChoice(event) {
    if (!choices.has(event.uid)) {
      choices.set(event.uid, {
        selected: true,
        listId: null,
        categoryId: null
      });
    }

    return choices.get(event.uid);
  }

  // Read stored choices and imported task IDs.
  async function loadSelections(events, savedResult = null) {
    const result = savedResult ?? await callFunction(
      "canvas-selections",
      { action: "load" }
    );

    const saved = new Map(
      (result.choices || []).map(item => [
        item.CanvasUID,
        item
      ])
    );

    const imported = new Map(
      (result.imported || []).map(item => [
        item.CanvasUID,
        String(item.TaskID)
      ])
    );

    const tasks = window.Tidy?.state?.tasks || [];

    for (const event of events) {
      const stored = saved.get(event.uid);
      const existingTaskId = imported.get(event.uid);
      const existingTask = tasks.find(
        task => String(task.id) === existingTaskId
      );

      // A local unsaved change takes precedence.
      if (!choices.has(event.uid)) {
        choices.set(event.uid, {
          selected: stored
            ? stored.Selected
            : existingTask
              ? true
              : true,
          listId: stored
            ? stored.ListID == null
              ? null : String(stored.ListID)
            : existingTask?.listId || null,
          categoryId: stored
            ? stored.CategoryID == null
              ? null : String(stored.CategoryID)
            : existingTask?.categoryId || null
        });
      }
    }

    return imported;
  }

  // Uses course preferences for new assignments.
  function applyCoursePreference(course, field, value, events) {
    for (const event of events) {
      const eventCourse = event.course || "Unsorted";
      if (eventCourse !== course) continue;

      getChoice(event)[field] = value || null;
    }

    const preference = coursePreferences.get(course) || {};
    preference[field] = value || null;
    coursePreferences.set(course, preference);
  }

  function renderPreview(section, events, imported) {
    const container =
      section.querySelector("#cw-canvas-preview");

    container.replaceChildren();

    container.appendChild(element(
      "h3",
      `Canvas Calendar Preview (${events.length} items)`
    ));

    container.appendChild(element(
      "p",
      "Select assignments and organize them by course.",
      "muted"
    ));

    if (!events.length) {
      container.appendChild(element(
        "p",
        "No calendar events were found."
      ));
      return;
    }

    const groups = new Map();

    for (const event of events) {
      const course = event.course || "Unsorted";

      if (!groups.has(course)) {
        groups.set(course, []);
      }

      groups.get(course).push(event);
    }

    const rows = new Map();
    const counter = element("p", "");
    container.appendChild(counter);

    function refreshCheckboxes() {
      let selected = 0;

      for (const event of events) {
        const checked = getChoice(event).selected;

        if (checked) selected++;

        const checkbox = rows.get(event.uid);
        if (checkbox) checkbox.checked = checked;
      }

      counter.textContent =
        `${selected} of ${events.length} selected`;
    }

    const allButton = element(
      "button",
      "Select / Deselect All",
      "btn btn-outline"
    );
    allButton.type = "button";

    allButton.addEventListener("click", () => {
      const allSelected = events.every(
        event => getChoice(event).selected
      );

      for (const event of events) {
        getChoice(event).selected = !allSelected;
      }

      refreshCheckboxes();
    });

    container.appendChild(allButton);

    const state = window.Tidy?.state;

    const listOptions = [
      { value: "", label: "No list" },
      ...(state?.lists || []).map(item => ({
        value: String(item.id),
        label: item.title
      }))
    ];

    const categoryOptions = [
      { value: "", label: "No category" },
      ...(state?.categories || []).map(item => ({
        value: String(item.id),
        label: item.name
      }))
    ];

    for (const [course, courseEvents] of groups) {
      const details = document.createElement("details");
      details.className = "cw-course";

      const summary = element(
        "summary",
        `${course} (${courseEvents.length} items)`
      );
      details.appendChild(summary);

      const settings = document.createElement("div");
      settings.className = "cw-course-settings";

      // Use saved defaults, or infer from the first item.
      const pref = coursePreferences.get(course) || {};
      const first = getChoice(courseEvents[0]);

      settings.appendChild(dropdown(
        "List for this course",
        listOptions,
        pref.listId ?? first.listId,
        value => applyCoursePreference(
          course, "listId", value, events
        )
      ));

      settings.appendChild(dropdown(
        "Category for this course",
        categoryOptions,
        pref.categoryId ?? first.categoryId,
        value => applyCoursePreference(
          course, "categoryId", value, events
        )
      ));

      details.appendChild(settings);

      const groupButton = element(
        "button",
        "Select / Deselect Course",
        "btn btn-outline"
      );
      groupButton.type = "button";

      groupButton.addEventListener("click", () => {
        const allSelected = courseEvents.every(
          event => getChoice(event).selected
        );

        for (const event of courseEvents) {
          getChoice(event).selected = !allSelected;
        }

        refreshCheckboxes();
      });

      details.appendChild(groupButton);

      for (const event of courseEvents) {
        const row = document.createElement("label");
        row.className = "cw-event-row";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = getChoice(event).selected;

        checkbox.addEventListener("change", () => {
          getChoice(event).selected = checkbox.checked;
          refreshCheckboxes();
        });

        rows.set(event.uid, checkbox);

        const info = document.createElement("div");
        info.appendChild(element(
          "strong",
          event.title || "Untitled"
        ));

        info.appendChild(element(
          "div",
          event.due
            ? `Date: ${event.due}`
            : "No date available",
          "muted"
        ));

        let label = imported.has(event.uid)
          ? "Already imported"
          : "New";

        if (!getChoice(event).selected) {
          label += " · Unselected";
        }

        info.appendChild(element(
          "div",
          label,
          "cw-status"
        ));

        row.append(checkbox, info);
        details.appendChild(row);
      }

      container.appendChild(details);
    }

    refreshCheckboxes();

    const buttons = document.createElement("div");
    buttons.className = "cw-actions";

    const importButton = element(
      "button",
      "Import New Assignments",
      "btn btn-primary"
    );
    importButton.type = "button";

    const updateButton = element(
      "button",
      "Update Selections",
      "btn btn-outline"
    );
    updateButton.type = "button";

    buttons.append(importButton, updateButton);
    container.appendChild(buttons);

    const feedback = element("p", "");
    feedback.setAttribute("role", "status");
    container.appendChild(feedback);

    function selectedItems() {
      return events.map(event => {
        const choice = getChoice(event);

        return {
          uid: event.uid,
          selected: choice.selected,
          listId: choice.listId,
          categoryId: choice.categoryId
        };
      });
    }

    function busy(value) {
      importButton.disabled = value;
      updateButton.disabled = value;
    }

    // Save checked/unchecked status, lists, and categories.
    async function saveSelections() {
        const items = selectedItems();

        const ids = items.map(item => item.uid);

        const duplicateCount = ids.length - new Set(ids).size;

        const invalidUIDs = items.filter(item =>
            typeof item.uid !== "string" ||
            !item.uid ||
            item.uid.length > 500
        ).length;

        const invalidLists = items.filter(item =>
        item.listId != null &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(item.listId))
        ).length;

        const invalidCategories = items.filter(item =>
            item.categoryId != null &&
            !/^\d+$/.test(String(item.categoryId))
        ).length;

        console.log(
            "Invalid list values:",
            [...new Set(
                items
                .filter(item =>
                    item.listId != null &&
                    !/^\d+$/.test(String(item.listId))
                )
                .map(item => String(item.listId))
            )]
        );

        console.table({
            total: items.length,
            duplicateUIDs: duplicateCount,
            invalidUIDs,
            invalidLists,
            invalidCategories
        });

        // Don't save anything if validation fails.
        if (
            duplicateCount ||
            invalidUIDs ||
            invalidLists ||
            invalidCategories
        ) {
            throw new Error(
            "Selection validation failed. Check the console."
            );
        }

        return callFunction("canvas-selections", {
            action: "save",
            items
        });
     }


    // Updates existing tasks and remembers new-item choices.
    updateButton.addEventListener("click", async () => {
      busy(true);
      feedback.textContent = "Saving selections...";

      try {
        const result = await saveSelections();

        await window.Tidy.reload();

        feedback.textContent =
          `Saved! ${result.updated} imported tasks updated.`;

        message(
          section,
          "Selections saved. Hidden assignments will not " +
          "appear on Home, To-do, or Calendar after reload."
        );

      } catch (error) {
        feedback.textContent = error.message;
        message(section, error.message, true);
      } finally {
        busy(false);
      }
    });

    // Only imports checked items not already imported.
    importButton.addEventListener("click", async () => {
      const newItems = selectedItems().filter(
        item => item.selected && !imported.has(item.uid)
      );

      if (!newItems.length) {
        feedback.textContent =
          "No new selected assignments to import. " +
          "Use Update Selections for existing tasks.";
        return;
      }

      if (!confirm(
        `Import ${newItems.length} new Canvas items?`
      )) return;

      busy(true);
      feedback.textContent = "Importing...";

      try {
        const result = await callFunction(
          "canvas-import",
          {
            items: newItems.map(item => ({
              uid: item.uid,
              listId: item.listId,
              categoryId: item.categoryId
            }))
          }
        );

        // Fetch fresh mappings before saving choices.
        const refreshed = await callFunction(
          "canvas-selections",
          { action: "load" }
        );

        imported.clear();
        for (const row of refreshed.imported || []) {
          imported.set(row.CanvasUID, String(row.TaskID));
        }

        await saveSelections();
        await window.Tidy.reload();

        feedback.textContent =
          `${result.added} new assignments imported!`;

        message(
          section,
          "Import complete! Open To-do or Calendar " +
          "to see your assignments."
        );

      } catch (error) {
        feedback.textContent =
          error.message +
          " Refresh and check your task list before retrying.";
        message(section, error.message, true);
      } finally {
        busy(false);
      }
    });
  }

  async function previewCanvas(section) {
    const button =
      section.querySelector("#cw-preview-button");

    button.disabled = true;
    button.textContent = "Loading Canvas calendar...";
    message(section, "Reading Canvas calendar...");

    try {
      console.time("Canvas parallel fetch");

      const [result, savedResult] = await Promise.all([
        callFunction("canvas-preview", {}),
        callFunction("canvas-selections", { action: "load" })
      ]);

      console.timeEnd("Canvas parallel fetch");

      if (!section.isConnected) return;

      const events = result.events || [];

      if (!Array.isArray(events)) {
        throw new Error("Unexpected Canvas response.");
      }

      console.time("Canvas selections processing");

      const imported = await loadSelections(events, savedResult);

      console.timeEnd("Canvas selections processing");

      previewData = { events, imported };

      console.time("Canvas rendering");

      renderPreview(section, events, imported);

      console.timeEnd("Canvas rendering");


      message(
        section,
        `Found ${events.length} calendar items.`
      );

    } catch (error) {
      message(section, error.message, true);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = "Preview Assignments";      }
    }
  }

  function showInterface(section) {
    const content =
      section.querySelector("#cw-canvas-content");

    if (!content) return;

    if (connected) {
      content.innerHTML = `
        <div class="cw-connection-status">
          <span class="cw-status-dot" aria-hidden="true"></span>
          <span>Canvas connected</span>
        </div>

        <p class="muted">
          Preview and manage assignments from your BYU Canvas calendar.
        </p>

        <button
          type="button"
          id="cw-preview-button"
          class="btn btn-primary"
        >
          Preview Assignments
        </button>

        <div id="cw-canvas-preview"
            style="margin-top:20px"></div>

        <div class="cw-disconnect-action">
          <button
            type="button"
            id="cw-disconnect"
            class="btn btn-outline"
          >
            Disconnect Canvas
          </button>
        </div>
      `;

      content.querySelector("#cw-preview-button")
        .addEventListener(
          "click",
          () => previewCanvas(section)
        );

      const disconnect =
        content.querySelector("#cw-disconnect");

      disconnect.addEventListener("click", async () => {
        if (!confirm("Disconnect your Canvas calendar?")) {
          return;
        }

        disconnect.disabled = true;

        try {
          await callCanvas("disconnect");
          connected = false;
          choices.clear();
          coursePreferences.clear();
          previewData = null;
          showInterface(section);
          message(section, "Canvas disconnected.");
        } catch (error) {
          message(section, error.message, true);
          disconnect.disabled = false;
        }
      });

    } else {
      content.innerHTML = `
        <p class="muted">
          Import your BYU Canvas assignments into CourseWise.
        </p>
        <form id="cw-canvas-form" class="form">
          <div class="field">
            <label for="cw-canvas-url">
              Canvas Calendar Feed URL
            </label>
            <input
              type="url"
              id="cw-canvas-url"
              placeholder="https://byu.instructure.com/feeds/calendars/..."
              required
              autocomplete="off"
              spellcheck="false"
            >
            <small>
              In Canvas, select Calendar → Calendar Feed.
              Keep your URL private.
            </small>
          </div>
          <button type="submit" class="btn btn-primary">
            Connect Canvas
          </button>
        </form>
      `;

      const form =
        content.querySelector("#cw-canvas-form");

      form.addEventListener("submit", async event => {
        event.preventDefault();

        const button = form.querySelector("button");
        const input = form.querySelector("#cw-canvas-url");

        button.disabled = true;
        message(section, "Connecting to Canvas...");

        try {
          await callCanvas("connect", input.value.trim());
          input.value = "";
          connected = true;
          choices.clear();
          coursePreferences.clear();
          showInterface(section);
          message(
            section,
            "Canvas connected successfully!"
          );
        } catch (error) {
          message(section, error.message, true);
          button.disabled = false;
        }
      });
    }
  }

  async function initializeCanvas(section) {
    if (section.dataset.canvasInitialized === "true") {
      return;
    }

    section.dataset.canvasInitialized = "true";
    currentSection = section;

    section.innerHTML = `
      <div class="section-head">
        <h2>Canvas Integration</h2>
      </div>
      <div id="cw-canvas-content">
        <p class="muted">Checking Canvas connection...</p>
      </div>
      <p id="cw-canvas-message"
        role="status"
        aria-live="polite"
        style="margin-top:12px"></p>
    `;

    try {
      const result = await callCanvas("status");

      if (!section.isConnected) return;

      connected = Boolean(result.connected);
      showInterface(section);

    } catch (error) {
      if (!section.isConnected) return;

      const content =
        section.querySelector("#cw-canvas-content");

      content.innerHTML = `
        <p class="muted">
          Could not load Canvas connection status.
        </p>
        <button type="button"
                id="cw-retry"
                class="btn btn-outline">
          Try Again
        </button>
      `;

      content.querySelector("#cw-retry")
        .addEventListener("click", () => {
          delete section.dataset.canvasInitialized;
          initializeCanvas(section);
        });

      message(section, error.message, true);
    }
  }

  function checkForCanvas() {
    const section =
      document.getElementById("canvas");

    if (section) {
      initializeCanvas(section);
    }
  }

  const observer = new MutationObserver(checkForCanvas);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  checkForCanvas();

})();
