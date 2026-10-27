
/*
  Coursewise Canvas Integration
  Connects a user's BYU Canvas calendar feed.

  Assignment importing will be added later.
*/

(() => {
  "use strict";

  const client = window.tidyClient;
  let connected = false;

  // Communicates with our Supabase Edge Function.
  async function callCanvas(action, feedUrl) {
    if (!client) {
      throw new Error("Supabase is not available.");
    }

    const { data: sessionData } = await client.auth.getSession();

    if (!sessionData?.session) {
      throw new Error("Please sign in to Coursewise again.");
    }

    const body = { action };

    if (action === "connect") {
      body.feedUrl = feedUrl;
    }

    const { data, error } = await client.functions.invoke(
      "canvas-connect",
      { body }
    );

    if (error) {
      let explanation = error.message;

      try {
        const response = await error.context?.json();
        explanation = response?.error || explanation;
      } catch {
        // Use the original error message.
      }

      throw new Error(explanation || "Could not connect to Canvas.");
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data || {};
  }

  // Displays a message on the Canvas section.
  function showMessage(section, text, isError = false) {
    const message = section.querySelector("#cw-canvas-message");

    if (message) {
      message.textContent = text;
      message.style.color = isError ? "#b42318" : "";
    }
  }

  // Displays the connected or disconnected interface.
  function showInterface(section) {
    if (!section.isConnected) return;

    const content = section.querySelector("#cw-canvas-content");

    if (!content) return;

    if (connected) {
      content.innerHTML = `
        <p><strong>Canvas calendar connected!</strong></p>
        <p class="muted">
          Your calendar feed has been saved.
          Assignment importing is coming next.
        </p>
        <button
          type="button"
          id="cw-disconnect"
          class="btn btn-outline"
        >
          Disconnect Canvas
        </button>
      `;

      const disconnectButton = content.querySelector("#cw-disconnect");

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
              Keep this URL private.
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
        const url = input.value.trim();

        if (!url) return;

        button.disabled = true;
        showMessage(section, "Connecting to Canvas...");

        try {
          await callCanvas("connect", url);

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

  // Prepares the Canvas section on the Profile page.
  async function initializeCanvas(section) {
    if (section.dataset.canvasInitialized === "true") {
      return;
    }

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

      content.querySelector("#cw-retry").addEventListener(
        "click",
        () => {
          delete section.dataset.canvasInitialized;
          initializeCanvas(section);
        }
      );

      showMessage(section, error.message, true);
    }
  }

  // Finds the Canvas section whenever Profile renders.
  function checkForCanvas() {
    const section = document.getElementById("canvas");

    if (section) {
      initializeCanvas(section);
    }
  }

  // The Profile page is rendered dynamically,
  // so watch for the Canvas section to appear.
  const observer = new MutationObserver(checkForCanvas);

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  checkForCanvas();

})();
