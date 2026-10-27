
/*
  Coursewise Canvas Integration
  Connect, disconnect, and preview BYU Canvas events.
  Preview does NOT create tasks.
*/

(() => {
  "use strict";

  const client = window.tidyClient;


  // Coursewise-style Canvas checkboxes
  const canvasStyles = document.createElement("style");

  canvasStyles.textContent = `
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
      transition: all 0.15s ease;
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

    #cw-canvas-preview label:hover {
      background: rgba(163, 91, 121, 0.04);
      border-radius: 8px;
    }
  `;

  document.head.appendChild(canvasStyles);


  let connected = false;

  async function callFunction(name, body) {
    if (!client) {
      throw new Error("Supabase is not available.");
    }

    const { data: sessionData } = await client.auth.getSession();

    if (!sessionData?.session) {
      throw new Error("Please sign in again.");
    }

    const { data, error } = await client.functions.invoke(
      name,
      { body }
    );

    if (error) {
      let explanation = error.message;

      try {
        const response = await error.context?.json();
        explanation = response?.error || explanation;
      } catch {
        // Keep original error.
      }

      throw new Error(explanation);
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data || {};
  }

  async function callCanvas(action, feedUrl) {
    const body = { action };

    if (action === "connect") {
      body.feedUrl = feedUrl;
    }

    return callFunction("canvas-connect", body);
  }

  function showMessage(section, text, isError = false) {
    const message = section.querySelector("#cw-canvas-message");

    if (message) {
      message.textContent = text;
      message.style.color = isError ? "#b42318" : "";
    }
  }

  function makeElement(tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text;

    if (className) {
      element.className = className;
    }

    return element;
  }

  // Displays the assignments and groups from Canvas.
  function displayPreview(section, events) {
    const container = section.querySelector("#cw-canvas-preview");
    if (!container) return;

    container.replaceChildren();

    const heading = makeElement(
      "h3",
      `Canvas Calendar Preview (${events.length} items)`
    );
    container.appendChild(heading);

    container.appendChild(makeElement(
      "p",
      "Review your Canvas events. Nothing will be imported yet.",
      "muted"
    ));

    if (events.length === 0) {
      container.appendChild(makeElement(
        "p",
        "No calendar events were found."
      ));
      return;
    }

    // Group events by their detected course.
    const groups = {};

    for (const event of events) {
      const course = event.course || "Unsorted";

      if (!groups[course]) {
        groups[course] = [];
      }

      groups[course].push(event);
    }

    const selected = new Set(
      events.map((event, index) => index)
    );


    const courseChoices = new Map();

    function makeDropdown(label, options) {
      const wrapper = document.createElement("div");
      wrapper.style.flex = "1";

      const caption = makeElement("label", label);
      caption.style.display = "block";
      caption.style.marginBottom = "5px";

      const select = document.createElement("select");
      select.style.width = "100%";

      for (const option of options) {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        select.appendChild(element);
      }

      wrapper.append(caption, select);
      return { wrapper, select };
    }


    const counter = makeElement("p", "");
    container.appendChild(counter);

    function updateCounter() {
      counter.textContent =
        `${selected.size} of ${events.length} items selected`;
    }

    updateCounter();

    const allButton = makeElement(
      "button",
      "Deselect All",
      "btn btn-outline"
    );
    allButton.type = "button";

    container.appendChild(allButton);

    // Keep references to every item checkbox.
    const checkboxes = [];

    allButton.addEventListener("click", () => {
      const selectAll = selected.size !== events.length;

      if (selectAll) {
        events.forEach((event, index) => selected.add(index));
      } else {
        selected.clear();
      }

      for (const checkbox of checkboxes) {
        checkbox.checked = selectAll;
      }

      allButton.textContent = selectAll
        ? "Deselect All"
        : "Select All";

      updateCounter();
    });

    for (const [course, courseEvents] of Object.entries(groups)) {
      const group = document.createElement("details");
      group.style.marginTop = "18px";

      const summary = makeElement(
        "summary",
        `${course} (${courseEvents.length} items)`
      );
      summary.style.cursor = "pointer";
      summary.style.fontWeight = "600";

      group.appendChild(summary);


      const state = window.Tidy.state;

      const listDropdown = makeDropdown(
        "List for this course",
        [
          { value: "", label: "No list" },
          ...state.lists.map(l => ({
            value: String(l.id),
            label: l.title
          }))
        ]
      );

      const categoryDropdown = makeDropdown(
        "Category for this course",
        [
          { value: "", label: "No category" },
          ...state.categories.map(c => ({
            value: String(c.id),
            label: c.name
          }))
        ]
      );

      const settings = document.createElement("div");
      settings.style.display = "flex";
      settings.style.flexWrap = "wrap";
      settings.style.gap = "12px";
      settings.style.marginTop = "12px";

      settings.append(
        listDropdown.wrapper,
        categoryDropdown.wrapper
      );

      group.appendChild(settings);

      courseChoices.set(course, {
        list: listDropdown.select,
        category: categoryDropdown.select
      });


      // Select or deselect an entire course.
      const groupButton = makeElement(
        "button",
        "Select / Deselect Course",
        "btn btn-outline"
      );
      groupButton.type = "button";
      groupButton.style.marginTop = "10px";
      groupButton.style.marginBottom = "10px";

      group.appendChild(groupButton);

      const courseCheckboxes = [];

      for (const event of courseEvents) {
        const index = events.indexOf(event);

        const row = document.createElement("label");
        row.style.display = "flex";
        row.style.alignItems = "flex-start";
        row.style.gap = "10px";
        row.style.padding = "10px 0";
        row.style.cursor = "pointer";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;

        const information = document.createElement("div");

        information.appendChild(
          makeElement("strong", event.title || "Untitled")
        );

        information.appendChild(makeElement(
          "div",
          event.due
            ? `Date: ${event.due}`
            : "No date available",
          "muted"
        ));

        if (event.kind === "calendar_event") {
          information.appendChild(makeElement(
            "small",
            "Calendar event (assignment status unconfirmed)",
            "muted"
          ));
        }

        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            selected.add(index);
          } else {
            selected.delete(index);
          }

          updateCounter();
          allButton.textContent =
            selected.size === events.length
              ? "Deselect All"
              : "Select All";
        });

        checkboxes.push(checkbox);
        courseCheckboxes.push({ checkbox, index });

        row.appendChild(checkbox);
        row.appendChild(information);
        group.appendChild(row);
      }

      groupButton.addEventListener("click", () => {
        const allChecked = courseCheckboxes.every(
          item => item.checkbox.checked
        );

        for (const item of courseCheckboxes) {
          item.checkbox.checked = !allChecked;

          if (allChecked) {
            selected.delete(item.index);
          } else {
            selected.add(item.index);
          }
        }

        updateCounter();
        allButton.textContent =
          selected.size === events.length
            ? "Deselect All"
            : "Select All";
      });

      container.appendChild(group);
    }

    
    const importButton = makeElement(
      "button",
      "Import Selected Assignments",
      "btn btn-primary"
    );

    importButton.type = "button";
    importButton.style.marginTop = "20px";

    const resultMessage = makeElement("p", "");
    resultMessage.setAttribute("role", "status");

    container.append(importButton, resultMessage);

    importButton.addEventListener("click", async () => {
      const items = events
        .filter((event, index) => selected.has(index))
        .map(event => {
          const choices = courseChoices.get(
            event.course || "Unsorted"
          );

          return {
            uid: event.uid,
            listId: choices?.list.value || null,
            categoryId: choices?.category.value || null
          };
        });

      if (items.length === 0) {
        resultMessage.textContent =
          "Select at least one assignment.";
        return;
      }

      if (!confirm(
        `Import ${items.length} selected items into Coursewise?`
      )) return;

      importButton.disabled = true;
      resultMessage.textContent = "Importing assignments...";

      try {
        const result = await callFunction(
          "canvas-import",
          { items }
        );

        await window.Tidy.reload();

        resultMessage.textContent =
          `${result.added} assignments imported! ` +
          `${result.skipped} already imported or unavailable.`;

        showMessage(
          section,
          "Import complete! Open To-do or Calendar to see your assignments."
        );

      } catch (error) {
        resultMessage.textContent =
          error.message + " Check your task list before retrying.";
      } finally {
        importButton.disabled = false;
      }
    });

  }

  // Requests the saved Canvas calendar from Supabase.
  async function previewCanvas(section) {
    const button = section.querySelector("#cw-preview-button");

    button.disabled = true;
    button.textContent = "Loading Canvas calendar...";
    showMessage(section, "Reading Canvas calendar...");

    try {
      const result = await callFunction("canvas-preview", {});

      if (!section.isConnected) return;

      const events = result.events || [];

      if (!Array.isArray(events)) {
        throw new Error("Canvas returned an unexpected response.");
      }

      displayPreview(section, events);

      showMessage(
        section,
        `Found ${events.length} calendar items.`
      );

    } catch (error) {
      showMessage(section, error.message, true);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = "Preview Canvas Assignments";
      }
    }
  }

  // Connected / disconnected screen.
  function showInterface(section) {
    if (!section.isConnected) return;

    const content = section.querySelector("#cw-canvas-content");
    if (!content) return;

    if (connected) {
      content.innerHTML = `
        <p><strong>Canvas calendar connected!</strong></p>

        <p class="muted">
          Your Canvas calendar is connected to Coursewise.
        </p>

        <button
          type="button"
          id="cw-preview-button"
          class="btn btn-primary"
        >
          Preview Canvas Assignments
        </button>

        <div id="cw-canvas-preview" style="margin-top:20px"></div>

        <div style="margin-top:20px">
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
        .addEventListener("click", () => previewCanvas(section));

      const disconnectButton =
        content.querySelector("#cw-disconnect");

      disconnectButton.addEventListener("click", async () => {
        if (!confirm("Disconnect your Canvas calendar?")) return;

        disconnectButton.disabled = true;
        showMessage(section, "Disconnecting...");

        try {
          await callCanvas("disconnect");

          connected = false;
          showInterface(section);
          showMessage(section, "Canvas disconnected.");

        } catch (error) {
          showMessage(section, error.message, true);
          disconnectButton.disabled = false;
        }
      });

    } else {
      content.innerHTML = `
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
              In Canvas, open Calendar and select
              Calendar Feed to copy your link.
              Keep the URL private.
            </small>
          </div>

          <button type="submit" class="btn btn-primary">
            Connect Canvas
          </button>
        </form>
      `;

      const form = content.querySelector("#cw-canvas-form");

      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const button = form.querySelector("button");
        const input = form.querySelector("#cw-canvas-url");

        button.disabled = true;
        showMessage(section, "Connecting to Canvas...");

        try {
          await callCanvas("connect", input.value.trim());

          input.value = "";
          connected = true;

          showInterface(section);
          showMessage(section, "Canvas connected successfully!");

        } catch (error) {
          showMessage(section, error.message, true);
          button.disabled = false;
        }
      });
    }
  }

  // Initializes Canvas when Profile renders.
  async function initializeCanvas(section) {
    if (section.dataset.canvasInitialized === "true") return;

    section.dataset.canvasInitialized = "true";

    section.innerHTML = `
      <div class="section-head">
        <h2>Canvas Integration</h2>
      </div>

      <p class="muted">
        Connect your BYU Canvas calendar to Coursewise.
      </p>

      <div id="cw-canvas-content">
        <p class="muted">Checking Canvas connection...</p>
      </div>

      <p
        id="cw-canvas-message"
        role="status"
        aria-live="polite"
        style="margin-top:12px"
      ></p>
    `;

    try {
      const result = await callCanvas("status");

      if (!section.isConnected) return;

      connected = Boolean(result.connected);
      showInterface(section);

    } catch (error) {
      if (!section.isConnected) return;

      const content = section.querySelector("#cw-canvas-content");

      content.innerHTML = `
        <p class="muted">
          Could not load Canvas connection status.
        </p>

        <button
          type="button"
          id="cw-retry"
          class="btn btn-outline"
        >
          Try Again
        </button>
      `;

      content.querySelector("#cw-retry")
        .addEventListener("click", () => {
          delete section.dataset.canvasInitialized;
          initializeCanvas(section);
        });

      showMessage(section, error.message, true);
    }
  }

  // Profile can dynamically recreate its Canvas section.
  function checkForCanvas() {
    const section = document.getElementById("canvas");

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
