// ============================================================
// Shelly Input -> Switch with OFF delay
//
// Behaviour:
//   Input ON
//      -> Output ON immediately
//
//   Input OFF after being ON for longer than SKIP_PERIOD
//      -> Output stays ON for OFF_DELAY
//      -> After delay output turns OFF
//
//   Input ON -> OFF within SKIP_PERIOD
//      -> Output turns OFF immediately
//
//   Input ON while OFF-delay is running
//      -> OFF-delay cancelled
//      -> Output remains ON
//
// Debug:
//   DEBUG = true/false
//   DEBUG_ALL_EVENTS = true/false
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================

let DEBUG = true;

// Print all Shelly status events.
// false = only "interesting" events are printed
let DEBUG_ALL_EVENTS = false;

let INPUT_ID = 0;
let OUTPUT_ID = 0;

let OFF_DELAY = 10 * 60;       // 10 minutes
let SKIP_PERIOD = 10;          // seconds

// Input polling interval
let POLL_INTERVAL = 1000;       // milliseconds


// ============================================================
// DEBUG
// ============================================================

function debug(msg) {
  if (DEBUG) {
    print("[OFF-DELAY] " + msg);
  }
}

// ============================================================
// EVENT DEBUGGING
// ============================================================

function debugEvent(event) {

  if (!DEBUG) {
    return;
  }

  // DEBUG_ALL_EVENTS = true:
  // Print absolutely every status event.
  if (DEBUG_ALL_EVENTS) {
    debug(
      "EVENT: " +
      JSON.stringify(event)
    );

    return;
  }

  // ----------------------------------------------------------
  // INPUT EVENTS
  // ----------------------------------------------------------

  if (event.component === "input:" + INPUT_ID) {
    debug(
      "EVENT: " +
      JSON.stringify(event)
    );

    return;
  }

  // ----------------------------------------------------------
  // SWITCH OUTPUT EVENTS
  //
  // Ignore periodic energy/power/voltage updates.
  // Only print events containing the actual output state.
  // ----------------------------------------------------------

  if (
    event.component === "switch:" + OUTPUT_ID &&
    event.delta &&
    event.delta.output !== undefined
  ) {
    debug(
      "EVENT: " +
      JSON.stringify(event)
    );

    return;
  }
}

// ============================================================
// STATE
// ============================================================

let inputState = false;
let lastInputOn = 0;

let offTimer = null;

// ============================================================
// OUTPUT CONTROL
// ============================================================

function outputOn() {

  debug(">>> TURNING OUTPUT ON");

  Shelly.call(
    "Switch.Set",
    {
      id: OUTPUT_ID,
      on: true
    },
    function (result, error_code, error_message) {

      if (error_code !== 0) {

        debug(
          "Switch.Set ON ERROR: " +
          error_code +
          " / " +
          error_message
        );

      } else {

        debug("Switch.Set ON OK");
      }
    }
  );
}

function outputOff() {

  debug(">>> TURNING OUTPUT OFF");

  Shelly.call(
    "Switch.Set",
    {
      id: OUTPUT_ID,
      on: false
    },
    function (result, error_code, error_message) {

      if (error_code !== 0) {

        debug(
          "Switch.Set OFF ERROR: " +
          error_code +
          " / " +
          error_message
        );

      } else {

        debug("Switch.Set OFF OK");
      }
    }
  );
}

// ============================================================
// OFF TIMER
// ============================================================

function cancelOffTimer() {

  if (offTimer !== null) {

    debug("Cancelling OFF timer");

    Timer.clear(offTimer);
    offTimer = null;
  }
}

function startOffTimer() {

  cancelOffTimer();

  debug(
    "Starting OFF delay: " +
    OFF_DELAY +
    " seconds"
  );

  offTimer = Timer.set(
    OFF_DELAY * 1000,
    false,
    function () {

      offTimer = null;

      debug("OFF delay expired");

      // Check the input one more time before
      // switching the output OFF.
      Shelly.call(
        "Input.GetStatus",
        {
          id: INPUT_ID
        },
        function (result, error_code, error_message) {

          if (error_code !== 0) {

            debug(
              "Input.GetStatus ERROR: " +
              error_code +
              " / " +
              error_message
            );

            return;
          }

          debug(
            "Input after timer: " +
            (result.state ? "ON" : "OFF")
          );

          if (result.state === false) {

            debug(
              "Input still OFF -> output OFF"
            );

            outputOff();

          } else {

            debug(
              "Input is ON -> keeping output ON"
            );
          }
        }
      );
    }
  );
}

// ============================================================
// INPUT CHANGE HANDLER
// ============================================================

function inputChanged(newState) {

  debug(
    "INPUT CHANGE: " +
    (inputState ? "ON" : "OFF") +
    " -> " +
    (newState ? "ON" : "OFF")
  );

  // ==========================================================
  // INPUT ON
  // ==========================================================

  if (newState === true) {

    lastInputOn = Date.now();

    debug("Input ON timestamp recorded");

    // Cancel any pending delayed OFF
    cancelOffTimer();

    // Turn output ON immediately
    outputOn();

    return;
  }

  // ==========================================================
  // INPUT OFF
  // ==========================================================

  let elapsed = 0;

  if (lastInputOn !== 0) {

    elapsed =
      (Date.now() - lastInputOn) / 1000;
  }

  debug(
    "Input OFF; ON duration = " +
    elapsed +
    " seconds"
  );

  // ----------------------------------------------------------
  // SHORT PULSE
  // ----------------------------------------------------------

  if (
    lastInputOn !== 0 &&
    elapsed <= SKIP_PERIOD
  ) {

    debug(
      "Short pulse detected: " +
      elapsed +
      "s <= " +
      SKIP_PERIOD +
      "s"
    );

    debug("Skipping OFF delay");

    cancelOffTimer();

    outputOff();

    return;
  }

  // ----------------------------------------------------------
  // NORMAL OFF
  // ----------------------------------------------------------

  debug(
    "Normal OFF -> starting delayed OFF"
  );

  startOffTimer();
}

// ============================================================
// INPUT POLLING
// ============================================================

function pollInput() {

  Shelly.call(
    "Input.GetStatus",
    {
      id: INPUT_ID
    },
    function (result, error_code, error_message) {

      if (error_code !== 0) {

        debug(
          "Input.GetStatus ERROR: " +
          error_code +
          " / " +
          error_message
        );

        return;
      }


      let newState = result.state;


      // Detect input state change
      if (newState !== inputState) {

        inputState = newState;

        inputChanged(newState);
      }
    }
  );
}

// ============================================================
// STATUS EVENT HANDLER
// ============================================================

Shelly.addStatusHandler(function (event) {

  debugEvent(event);
});

// ============================================================
// STARTUP
// ============================================================

debug("==============================");
debug("OFF-DELAY SCRIPT STARTING");
debug("==============================");

debug("INPUT_ID       = " + INPUT_ID);
debug("OUTPUT_ID      = " + OUTPUT_ID);
debug("OFF_DELAY      = " + OFF_DELAY + " seconds");
debug("SKIP_PERIOD    = " + SKIP_PERIOD + " seconds");
debug("POLL_INTERVAL  = " + POLL_INTERVAL + " ms");
debug("DEBUG          = " + DEBUG);
debug("DEBUG_ALL_EVENTS = " + DEBUG_ALL_EVENTS);

// ------------------------------------------------------------
// Get initial input state
// ------------------------------------------------------------

Shelly.call(
  "Input.GetStatus",
  {
    id: INPUT_ID
  },
  function (result, error_code, error_message) {

    if (error_code !== 0) {

      debug(
        "Startup Input.GetStatus ERROR: " +
        error_code +
        " / " +
        error_message
      );

      return;
    }

    inputState = result.state;

    debug(
      "Startup input state: " +
      (inputState ? "ON" : "OFF")
    );

    if (inputState === true) {

      // Script started while input is ON.
      // Turn output ON.
      lastInputOn = Date.now();

      outputOn();

    } else {

      // Script started while input is OFF.
      // Ensure output is OFF.
      cancelOffTimer();

      outputOff();
    }
  }
);

// ============================================================
// START INPUT POLLING
// ============================================================

Timer.set(
  POLL_INTERVAL,
  true,
  pollInput
);

debug("Input polling started");
debug("Script initialized");