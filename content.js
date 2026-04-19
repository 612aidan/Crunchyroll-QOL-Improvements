(function () {
  const settingsApi = globalThis.CrunchyrollSkipSettings;
  const DEFAULT_SETTINGS = settingsApi ? settingsApi.DEFAULT_SETTINGS : {
    enterToSkipEnabled: true,
    globalPlaybackKeysEnabled: true,
    hidePersistentSkipButtonsEnabled: true,
    hidePersistentSkipButtonsAfterSeconds: 7
  };

  const VERSION = "1.0";
  const WATCH_PATH_PREFIX = "/watch/";
  const PLAYER_ROOT_SELECTOR = '#player-container, [data-testid="player-controls-root"]';
  const PLAYER_KEYBOARD_TARGET_SELECTORS = [
    '#player-container [tabindex="-1"]',
    '#player-container [data-testid="player-controls-root"]',
    '#player-container [tabindex="0"]',
    '[data-testid="player-controls-root"]',
    '#player-container'
  ];
  const CANDIDATE_SELECTORS = [
    'button[aria-label]',
    'button',
    '[role="button"][aria-label]',
    '[role="button"]'
  ];
  const SKIP_LABEL_PATTERN = /\bskip\b/i;
  const SKIP_LABEL_ALLOWLIST = [
    "skip intro",
    "skip recap",
    "skip credits",
    "skip ad",
    "skip ads"
  ];
  const PERSISTENT_HIDE_LABELS = new Set([
    "skip intro",
    "skip recap",
    "skip credits"
  ]);
  const DEBUG_PREFIX = "[Crunchyroll Skip Debug]";
  const DEBUG_REQUEST_EVENT = "crunchyroll-skip-debug-request";
  const DEBUG_RESPONSE_EVENT = "crunchyroll-skip-debug-response";
  const KEY_EVENTS = ["keydown", "keyup", "keypress"];
  const PLAYBACK_KEY_CODES = new Set([
    "ArrowLeft",
    "ArrowRight",
    "Space"
  ]);
  const HIDEABLE_ATTRIBUTE = "data-crunchyroll-skip-hideable";
  const HIDDEN_ATTRIBUTE = "data-crunchyroll-skip-hidden";
  const HIDDEN_LABEL_ATTRIBUTE = "data-crunchyroll-skip-hidden-label";
  const HIDDEN_STYLE_ID = "crunchyroll-skip-hidden-style";
  const MAINTENANCE_INTERVAL_MS = 500;
  const REWIND_THRESHOLD_SECONDS = 2;
  const HIDE_FADE_DURATION_MS = 220;

  let currentSettings = { ...DEFAULT_SETTINGS };
  const visibleSinceByElement = new Map();
  const hiddenElements = new Set();
  const hiddenElementObservers = new Map();
  let maintenanceIntervalId = null;
  let trackedVideoElement = null;
  let lastKnownVideoTime = null;
  let removeTrackedVideoListeners = null;
  let trackedWatchPathname = null;

  function log(stage, message, details) {
    if (typeof details === "undefined") {
      console.log(`${DEBUG_PREFIX} [${stage}] ${message}`);
      return;
    }

    console.log(`${DEBUG_PREFIX} [${stage}] ${message}`, details);
  }

  function warn(stage, message, details) {
    if (typeof details === "undefined") {
      console.warn(`${DEBUG_PREFIX} [${stage}] ${message}`);
      return;
    }

    console.warn(`${DEBUG_PREFIX} [${stage}] ${message}`, details);
  }

  function error(stage, message, details) {
    if (typeof details === "undefined") {
      console.error(`${DEBUG_PREFIX} [${stage}] ${message}`);
      return;
    }

    console.error(`${DEBUG_PREFIX} [${stage}] ${message}`, details);
  }

  function isWatchPage() {
    return window.location.pathname.startsWith(WATCH_PATH_PREFIX);
  }

  function isEnterEvent(event) {
    return event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter";
  }

  function isPlaybackShortcutEvent(event) {
    if (
      !(event instanceof KeyboardEvent) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return false;
    }

    return PLAYBACK_KEY_CODES.has(event.code);
  }

  function describeElement(element) {
    if (!(element instanceof Element)) {
      return {
        kind: typeof element
      };
    }

    return {
      tag: element.tagName,
      id: element.id || null,
      className: element.className || null,
      ariaLabel: element.getAttribute("aria-label"),
      dataTestId: element.getAttribute("data-testid"),
      role: element.getAttribute("role"),
      text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120)
    };
  }

  function describeDocumentState() {
    return {
      hasFocus: document.hasFocus(),
      visibilityState: document.visibilityState,
      fullscreenElement: describeElement(document.fullscreenElement),
      activeElement: describeElement(document.activeElement)
    };
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      return true;
    }

    return Boolean(target.closest('[contenteditable=""], [contenteditable="true"], input, textarea, select'));
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    if (Number.parseFloat(style.opacity || "1") === 0) {
      return false;
    }

    if (element.getAttribute("aria-hidden") === "true") {
      return false;
    }

    if (element.hasAttribute("disabled")) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getLabel(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    return (
      element.getAttribute("aria-label") ||
      element.innerText ||
      element.textContent ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function isExtensionHidden(element) {
    return element instanceof HTMLElement && element.getAttribute(HIDDEN_ATTRIBUTE) === "true";
  }

  function withTemporarilyRevealed(element, callback) {
    if (!(element instanceof HTMLElement) || !isExtensionHidden(element)) {
      return callback();
    }

    const hiddenValue = element.getAttribute(HIDDEN_ATTRIBUTE);
    const hiddenLabel = element.getAttribute(HIDDEN_LABEL_ATTRIBUTE);
    element.removeAttribute(HIDDEN_ATTRIBUTE);

    try {
      return callback();
    } finally {
      if (hiddenValue !== null) {
        element.setAttribute(HIDDEN_ATTRIBUTE, hiddenValue);
      }

      if (hiddenLabel !== null) {
        element.setAttribute(HIDDEN_LABEL_ATTRIBUTE, hiddenLabel);
      }
    }
  }

  function getNaturalLabel(element) {
    return withTemporarilyRevealed(element, () => getLabel(element));
  }

  function isNaturallyVisible(element) {
    return withTemporarilyRevealed(element, () => isVisible(element));
  }

  function ensureHiddenStyle() {
    if (document.getElementById(HIDDEN_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = HIDDEN_STYLE_ID;
    style.textContent = `
      [${HIDEABLE_ATTRIBUTE}="true"] {
        transition:
          opacity ${HIDE_FADE_DURATION_MS}ms ease,
          visibility 0s linear ${HIDE_FADE_DURATION_MS}ms !important;
      }

      [${HIDDEN_ATTRIBUTE}="true"] {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
    log("hide", "Injected hidden button style");
  }

  function prepareElementForHide(element) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    ensureHiddenStyle();
    element.setAttribute(HIDEABLE_ATTRIBUTE, "true");
  }

  function getSearchRoots() {
    const roots = [];
    const playerRoot = document.querySelector(PLAYER_ROOT_SELECTOR);

    if (playerRoot) {
      roots.push({
        name: "player",
        node: playerRoot
      });
    }

    roots.push({
      name: "document",
      node: document
    });

    return roots;
  }

  function getPlayerKeyboardTarget() {
    for (const selector of PLAYER_KEYBOARD_TARGET_SELECTORS) {
      const target = document.querySelector(selector);

      if (target instanceof HTMLElement) {
        return target;
      }
    }

    return null;
  }

  function isElementWithinPlayer(element) {
    return element instanceof Element && Boolean(element.closest(PLAYER_ROOT_SELECTOR));
  }

  function buildForwardedKeyboardEvent(event) {
    const key = event.code === "Space" ? " " : event.key;
    const keyCodeMap = {
      ArrowLeft: 37,
      ArrowRight: 39,
      Space: 32
    };
    const keyCode = keyCodeMap[event.code] || event.keyCode || 0;

    return new KeyboardEvent("keydown", {
      key,
      code: event.code,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      composed: true,
      repeat: event.repeat,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey
    });
  }

  function forwardPlaybackShortcutToPlayer(event, source) {
    const target = getPlayerKeyboardTarget();

    if (!(target instanceof HTMLElement)) {
      warn("playback", "No player keyboard target available for forwarded shortcut", {
        source,
        code: event.code
      });
      return false;
    }

    focusPlayerKeyboardTarget(target, source);

    const forwardedEvent = buildForwardedKeyboardEvent(event);
    const dispatchResult = target.dispatchEvent(forwardedEvent);

    log("playback", "Forwarded playback shortcut to player target", {
      source,
      key: event.key,
      code: event.code,
      dispatchResult,
      target: describeElement(target),
      activeElement: describeElement(document.activeElement)
    });

    return true;
  }

  function collectElements(root, shouldLogCounts) {
    const seen = new Set();
    const collected = [];

    for (const selector of CANDIDATE_SELECTORS) {
      const elements = Array.from(root.node.querySelectorAll(selector));

      if (shouldLogCounts) {
        log("scan", "Selector count", {
          root: root.name,
          selector,
          count: elements.length
        });
      }

      for (const element of elements) {
        if (seen.has(element)) {
          continue;
        }

        seen.add(element);
        collected.push({
          element,
          selector
        });
      }
    }

    return collected;
  }

  function evaluateCandidate(element, rootName, selector) {
    const label = getLabel(element);
    const visible = isVisible(element);
    const exactMatch = SKIP_LABEL_ALLOWLIST.includes(label);
    const containsSkip = SKIP_LABEL_PATTERN.test(label);
    const isExcluded = label.includes("next episode");
    const extensionHidden = isExtensionHidden(element);
    const persistentHideEligible = PERSISTENT_HIDE_LABELS.has(label);

    let accepted = false;
    let reason = "missing label";
    let priority = 99;

    if (!label) {
      reason = "missing label";
    } else if (isExcluded) {
      reason = "excluded next episode control";
    } else if (visible && exactMatch) {
      accepted = true;
      reason = "visible exact allowlist match";
      priority = 1;
    } else if (visible && containsSkip) {
      accepted = true;
      reason = "visible generic skip match";
      priority = 2;
    } else if (extensionHidden && persistentHideEligible) {
      accepted = true;
      reason = "extension hidden persistent skip";
      priority = 3;
    } else if (!visible) {
      reason = "not visible";
    } else {
      reason = "label does not match skip rules";
    }

    return {
      element,
      rootName,
      selector,
      label,
      visible,
      exactMatch,
      containsSkip,
      isExcluded,
      extensionHidden,
      persistentHideEligible,
      accepted,
      priority,
      reason,
      summary: {
        ...describeElement(element),
        label,
        visible,
        exactMatch,
        containsSkip,
        isExcluded,
        extensionHidden,
        persistentHideEligible,
        accepted,
        priority,
        reason,
        rootName,
        selector
      }
    };
  }

  function collectCandidates() {
    const roots = getSearchRoots();
    const evaluations = [];

    log("scan", "Starting candidate scan", {
      pathname: window.location.pathname,
      playerRootFound: roots.some((root) => root.name === "player"),
      roots: roots.map((root) => root.name)
    });

    for (const root of roots) {
      const collected = collectElements(root, true);

      for (const entry of collected) {
        evaluations.push(evaluateCandidate(entry.element, root.name, entry.selector));
      }
    }

    log(
      "scan",
      "Candidate analysis complete",
      evaluations.map((evaluation) => evaluation.summary)
    );

    return evaluations;
  }

  function chooseCandidate(evaluations) {
    const accepted = evaluations
      .filter((evaluation) => evaluation.accepted)
      .sort((left, right) => left.priority - right.priority);

    if (accepted.length === 0) {
      warn("scan", "No accepted skip candidate found");
      return null;
    }

    const chosen = accepted[0];
    log("scan", "Chosen skip candidate", chosen.summary);
    return chosen;
  }

  function dispatchPointerSequence(element) {
    const rect = element.getBoundingClientRect();
    const eventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0
    };

    const steps = [];
    const pointerEventSupported = typeof window.PointerEvent === "function";

    if (pointerEventSupported) {
      element.dispatchEvent(new PointerEvent("pointerdown", eventInit));
      steps.push("pointerdown");
    }

    element.dispatchEvent(new MouseEvent("mousedown", eventInit));
    steps.push("mousedown");

    if (pointerEventSupported) {
      element.dispatchEvent(new PointerEvent("pointerup", eventInit));
      steps.push("pointerup");
    }

    element.dispatchEvent(new MouseEvent("mouseup", eventInit));
    steps.push("mouseup");
    element.dispatchEvent(new MouseEvent("click", eventInit));
    steps.push("click");

    return steps;
  }

  function activateCandidate(candidate, source) {
    const element = candidate.element;

    log("activate", "Attempting activation", {
      source,
      candidate: candidate.summary
    });

    try {
      element.focus();
      log("activate", "Focus step completed", {
        source,
        activeElement: describeElement(document.activeElement)
      });
    } catch (focusError) {
      error("activate", "Focus step failed", {
        source,
        error: String(focusError)
      });
    }

    try {
      element.click();
      log("activate", "Native click() executed", {
        source,
        candidate: candidate.summary
      });
    } catch (clickError) {
      error("activate", "Native click() failed", {
        source,
        error: String(clickError)
      });
    }

    try {
      const dispatchedSteps = dispatchPointerSequence(element);
      log("activate", "Pointer and mouse dispatch sequence executed", {
        source,
        dispatchedSteps,
        candidate: candidate.summary
      });
    } catch (dispatchError) {
      error("activate", "Pointer dispatch failed", {
        source,
        error: String(dispatchError)
      });
    }

    return true;
  }

  function analyzeCandidates(source) {
    const evaluations = collectCandidates();
    const chosen = chooseCandidate(evaluations);
    const accepted = evaluations
      .filter((evaluation) => evaluation.accepted)
      .map((evaluation) => evaluation.summary);

    log("scan", "Inspection summary", {
      source,
      acceptedCount: accepted.length,
      chosen: chosen ? chosen.summary : null
    });

    return {
      source,
      version: VERSION,
      pathname: window.location.pathname,
      settings: { ...currentSettings },
      evaluations,
      accepted,
      chosen,
      chosenSummary: chosen ? chosen.summary : null,
      all: evaluations.map((evaluation) => evaluation.summary)
    };
  }

  function inspectCandidates(source) {
    const analysis = analyzeCandidates(source);

    return {
      source: analysis.source,
      version: analysis.version,
      pathname: analysis.pathname,
      settings: analysis.settings,
      accepted: analysis.accepted,
      chosen: analysis.chosenSummary,
      all: analysis.all
    };
  }

  function trySkip(source) {
    if (!currentSettings.enterToSkipEnabled) {
      warn("settings", "Enter-to-skip is disabled", {
        source,
        settings: currentSettings
      });
      return false;
    }

    const analysis = analyzeCandidates(source);

    if (!analysis.chosen) {
      warn("activate", "No visible skip control to activate", {
        source,
        pathname: window.location.pathname
      });
      return false;
    }

    activateCandidate(analysis.chosen, source);
    return true;
  }

  function focusPlayerKeyboardTarget(target, source) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    try {
      target.focus({
        preventScroll: true
      });
      log("playback", "Focused player keyboard target", {
        source,
        target: describeElement(target)
      });
      return true;
    } catch (focusError) {
      error("playback", "Failed to focus player keyboard target", {
        source,
        error: String(focusError),
        target: describeElement(target)
      });
      return false;
    }
  }

  function handlePlaybackShortcut(source, event, eventName) {
    if (!isWatchPage()) {
      return false;
    }

    if (!currentSettings.globalPlaybackKeysEnabled) {
      return false;
    }

    if (!isPlaybackShortcutEvent(event)) {
      return false;
    }

    if (!event.isTrusted) {
      log("playback", "Ignoring synthetic playback shortcut event", {
        source,
        eventName,
        key: event.key,
        code: event.code,
        target: describeElement(event.target)
      });
      return false;
    }

    if (event.defaultPrevented || isEditableTarget(event.target)) {
      warn("playback", "Skipping global playback shortcut handling", {
        source,
        eventName,
        defaultPrevented: event.defaultPrevented,
        target: describeElement(event.target)
      });
      return false;
    }

    if (eventName !== "keydown") {
      return false;
    }

    if (isElementWithinPlayer(event.target)) {
      log("playback", "Allowing native player shortcut handling", {
        source,
        eventName,
        key: event.key,
        code: event.code,
        target: describeElement(event.target)
      });
      return false;
    }

    const handled = forwardPlaybackShortcutToPlayer(event, source);
    if (!handled) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();

    log("playback", "Handled playback shortcut by forwarding to player", {
      source,
      eventName,
      key: event.key,
      code: event.code,
      activeElement: describeElement(document.activeElement)
    });

    return true;
  }

  function hidePersistentButton(element, context) {
    if (!(element instanceof HTMLElement) || isExtensionHidden(element)) {
      return;
    }

    prepareElementForHide(element);
    element.setAttribute(HIDDEN_ATTRIBUTE, "true");
    element.setAttribute(HIDDEN_LABEL_ATTRIBUTE, context.label || getLabel(element));
    hiddenElements.add(element);
    visibleSinceByElement.delete(element);
    observeHiddenElement(element);

    log("hide", "Persistent skip button hidden", {
      ...context,
      element: describeElement(element)
    });
  }

  function restoreHiddenButton(element, reason) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    disconnectHiddenElementObserver(element);
    hiddenElements.delete(element);
    visibleSinceByElement.delete(element);

    if (!isExtensionHidden(element)) {
      return;
    }

    element.removeAttribute(HIDDEN_ATTRIBUTE);
    element.removeAttribute(HIDDEN_LABEL_ATTRIBUTE);

    log("hide", "Persistent skip button restored", {
      reason,
      element: describeElement(element)
    });
  }

  function disconnectHiddenElementObserver(element) {
    const observer = hiddenElementObservers.get(element);

    if (!observer) {
      return;
    }

    observer.disconnect();
    hiddenElementObservers.delete(element);
  }

  function observeHiddenElement(element) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    disconnectHiddenElementObserver(element);

    const hiddenLabel = element.getAttribute(HIDDEN_LABEL_ATTRIBUTE) || "";
    const observer = new MutationObserver(() => {
      const currentLabel = getNaturalLabel(element);

      if (!element.isConnected) {
        disconnectHiddenElementObserver(element);
        hiddenElements.delete(element);
        visibleSinceByElement.delete(element);
        return;
      }

      if (!currentLabel) {
        return;
      }

      if (currentLabel !== hiddenLabel) {
        restoreHiddenButton(element, "persistent skip content changed");
      }
    });

    observer.observe(element, {
      attributes: true,
      attributeFilter: ["aria-label", "data-testid", "class"],
      childList: true,
      characterData: true,
      subtree: true
    });

    hiddenElementObservers.set(element, observer);
  }

  function clearVisibleSinceEntries() {
    for (const element of Array.from(visibleSinceByElement.keys())) {
      visibleSinceByElement.delete(element);
    }
  }

  function restoreAllHiddenButtons(reason) {
    for (const element of Array.from(hiddenElements)) {
      restoreHiddenButton(element, reason);
    }
  }

  function resetPersistentHideState(reason, details) {
    clearVisibleSinceEntries();
    restoreAllHiddenButtons(reason);

    log("hide", "Persistent hide state reset", {
      reason,
      ...details
    });
  }

  function getPlayerVideoElement() {
    return document.querySelector("#player-container video, video");
  }

  function detachTrackedVideoListeners() {
    if (typeof removeTrackedVideoListeners === "function") {
      removeTrackedVideoListeners();
    }

    removeTrackedVideoListeners = null;
  }

  function attachTrackedVideoListeners(videoElement) {
    if (!(videoElement instanceof HTMLVideoElement)) {
      return;
    }

    const handleTimeUpdate = () => {
      if (!Number.isNaN(videoElement.currentTime)) {
        lastKnownVideoTime = videoElement.currentTime;
      }
    };

    const handleSeeking = () => {
      if (
        typeof lastKnownVideoTime === "number" &&
        !Number.isNaN(videoElement.currentTime) &&
        videoElement.currentTime + REWIND_THRESHOLD_SECONDS < lastKnownVideoTime
      ) {
        resetPersistentHideState("playback rewound", {
          source: "video-seeking",
          from: lastKnownVideoTime,
          to: videoElement.currentTime
        });
      }

      log("video", "Video seeking observed", {
        currentTime: videoElement.currentTime,
        previousTime: lastKnownVideoTime
      });
    };

    const handleSeeked = () => {
      if (!Number.isNaN(videoElement.currentTime)) {
        lastKnownVideoTime = videoElement.currentTime;
      }

      log("video", "Video seek completed", {
        currentTime: videoElement.currentTime
      });
    };

    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("seeking", handleSeeking);
    videoElement.addEventListener("seeked", handleSeeked);

    removeTrackedVideoListeners = () => {
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("seeking", handleSeeking);
      videoElement.removeEventListener("seeked", handleSeeked);
    };
  }

  function trackPlaybackState(source) {
    const videoElement = getPlayerVideoElement();

    if (videoElement !== trackedVideoElement) {
      if (trackedVideoElement && trackedVideoElement.isConnected) {
        resetPersistentHideState("video element changed", {
          source
        });
      }

      detachTrackedVideoListeners();
      trackedVideoElement = videoElement;
      lastKnownVideoTime = videoElement ? videoElement.currentTime : null;
      attachTrackedVideoListeners(videoElement);

      log("video", "Tracking video element", {
        source,
        hasVideoElement: Boolean(videoElement),
        currentTime: videoElement ? videoElement.currentTime : null
      });

      return;
    }

    if (!videoElement || Number.isNaN(videoElement.currentTime)) {
      lastKnownVideoTime = null;
      return;
    }

    lastKnownVideoTime = videoElement.currentTime;
  }

  function syncTrackedWatchPathname(source) {
    if (!isWatchPage()) {
      trackedWatchPathname = null;
      return;
    }

    const nextPathname = window.location.pathname;

    if (trackedWatchPathname === null) {
      trackedWatchPathname = nextPathname;
      return;
    }

    if (trackedWatchPathname === nextPathname) {
      return;
    }

    const previousPathname = trackedWatchPathname;

    resetPersistentHideState("watch page changed", {
      source,
      from: previousPathname,
      to: nextPathname
    });

    detachTrackedVideoListeners();
    trackedVideoElement = null;
    lastKnownVideoTime = null;
    trackedWatchPathname = nextPathname;

    log("video", "Watch pathname changed", {
      source,
      from: previousPathname,
      to: nextPathname
    });
  }

  function runPersistentHideMaintenance(source) {
    if (!isWatchPage()) {
      detachTrackedVideoListeners();
      trackedVideoElement = null;
      lastKnownVideoTime = null;
      trackedWatchPathname = null;
      clearVisibleSinceEntries();
      restoreAllHiddenButtons("no longer on watch page");
      return;
    }

    syncTrackedWatchPathname(source);
    trackPlaybackState(source);

    const videoElement = trackedVideoElement;

    if (!currentSettings.hidePersistentSkipButtonsEnabled) {
      clearVisibleSinceEntries();
      restoreAllHiddenButtons("hide persistent skip buttons disabled");
      return;
    }

    if (videoElement instanceof HTMLVideoElement && videoElement.paused) {
      clearVisibleSinceEntries();
      restoreAllHiddenButtons("video paused");
      return;
    }

    const now = Date.now();
    const hideAfterMs = currentSettings.hidePersistentSkipButtonsAfterSeconds * 1000;
    const eligiblePersistentButtons = new Set();

    for (const element of Array.from(visibleSinceByElement.keys())) {
      if (!element.isConnected) {
        visibleSinceByElement.delete(element);
      }
    }

    for (const root of getSearchRoots()) {
      for (const entry of collectElements(root, false)) {
        const element = entry.element;
        const label = getNaturalLabel(element);

        if (!PERSISTENT_HIDE_LABELS.has(label)) {
          continue;
        }

        eligiblePersistentButtons.add(element);

        const naturallyVisible = isNaturallyVisible(element);
        const hiddenLabel = element.getAttribute(HIDDEN_LABEL_ATTRIBUTE);

        if (!naturallyVisible) {
          visibleSinceByElement.delete(element);

          continue;
        }

        if (isExtensionHidden(element)) {
          if (hiddenLabel && hiddenLabel !== label) {
            restoreHiddenButton(element, "persistent skip label changed");
            visibleSinceByElement.set(element, now);
          }

          continue;
        }

        const visibleSince = visibleSinceByElement.get(element) || now;
        visibleSinceByElement.set(element, visibleSince);

        if (now - visibleSince >= hideAfterMs) {
          hidePersistentButton(element, {
            source,
            label,
            hideAfterMs
          });
        }
      }
    }

    for (const element of Array.from(hiddenElements)) {
      if (!element.isConnected) {
        hiddenElements.delete(element);
        continue;
      }

      if (!eligiblePersistentButtons.has(element)) {
        restoreHiddenButton(element, "persistent skip button no longer eligible");
      }
    }
  }

  function startPersistentHideMaintenance() {
    if (maintenanceIntervalId !== null) {
      return;
    }

    maintenanceIntervalId = window.setInterval(() => {
      runPersistentHideMaintenance("interval");
    }, MAINTENANCE_INTERVAL_MS);

    log("hide", "Persistent hide maintenance started", {
      intervalMs: MAINTENANCE_INTERVAL_MS
    });
  }

  function shouldLogKeyEvent(event) {
    return isEnterEvent(event) || isPlaybackShortcutEvent(event);
  }

  function handleEnterAttempt(source, event) {
    if (!isWatchPage()) {
      warn("keydown", "Ignoring keydown because page is not a watch page", {
        source,
        pathname: window.location.pathname
      });
      return;
    }

    if (!isEnterEvent(event)) {
      warn("keydown", "Ignoring non-Enter key", {
        source,
        key: event.key,
        code: event.code
      });
      return;
    }

    if (!currentSettings.enterToSkipEnabled) {
      warn("settings", "Ignoring Enter because enter-to-skip is disabled", {
        source,
        settings: currentSettings
      });
      return;
    }

    if (event.defaultPrevented) {
      warn("keydown", "Ignoring Enter because event.defaultPrevented is true", {
        source
      });
      return;
    }

    if (event.repeat) {
      warn("keydown", "Ignoring repeated Enter keydown", {
        source
      });
      return;
    }

    if (isEditableTarget(event.target)) {
      warn("keydown", "Ignoring Enter from editable target", {
        source,
        target: describeElement(event.target)
      });
      return;
    }

    if (trySkip(`keydown:${source}`)) {
      event.preventDefault();
      event.stopPropagation();
      log("keydown", "Enter handled by skip control", {
        source
      });
      return;
    }

    warn("keydown", "No skip control handled this Enter press", {
      source
    });
  }

  function installKeyboardDiagnostics() {
    for (const eventName of KEY_EVENTS) {
      window.addEventListener(
        eventName,
        (event) => {
          if (!shouldLogKeyEvent(event)) {
            return;
          }

          log("keyboard", "Window event observed", {
            source: "window",
            eventName,
            key: event.key,
            code: event.code,
            defaultPrevented: event.defaultPrevented,
            repeat: event.repeat,
            target: describeElement(event.target),
            documentState: describeDocumentState()
          });

          if (handlePlaybackShortcut("window", event, eventName)) {
            return;
          }

          if (eventName === "keydown") {
            handleEnterAttempt("window", event);
          }
        },
        true
      );

      document.addEventListener(
        eventName,
        (event) => {
          if (!shouldLogKeyEvent(event)) {
            return;
          }

          log("keyboard", "Document event observed", {
            source: "document",
            eventName,
            key: event.key,
            code: event.code,
            defaultPrevented: event.defaultPrevented,
            repeat: event.repeat,
            target: describeElement(event.target),
            documentState: describeDocumentState()
          });
        },
        true
      );
    }

    window.addEventListener("focus", () => {
      log("focus", "Window focus", describeDocumentState());
    });

    window.addEventListener("blur", () => {
      warn("focus", "Window blur", describeDocumentState());
    });

    document.addEventListener("focusin", (event) => {
      log("focus", "Focus moved within document", {
        target: describeElement(event.target),
        documentState: describeDocumentState()
      });
    });

    document.addEventListener("visibilitychange", () => {
      log("focus", "Visibility changed", describeDocumentState());
    });

    document.addEventListener("fullscreenchange", () => {
      log("focus", "Fullscreen changed", describeDocumentState());
    });

    log("init", "Keyboard diagnostics installed", {
      events: KEY_EVENTS,
      documentState: describeDocumentState()
    });
  }

  function applySettings(nextSettings, source) {
    currentSettings = {
      ...DEFAULT_SETTINGS,
      ...nextSettings
    };

    log("settings", "Applied settings", {
      source,
      settings: currentSettings
    });

    if (!currentSettings.hidePersistentSkipButtonsEnabled) {
      resetPersistentHideState("hide persistent skip buttons disabled", {
        source
      });
      return;
    }

    runPersistentHideMaintenance(`settings:${source}`);
  }

  async function loadSettings() {
    if (!settingsApi) {
      warn("settings", "Settings API unavailable, using defaults", {
        settings: currentSettings
      });
      return;
    }

    try {
      const storedSettings = await settingsApi.getSettings();
      applySettings(storedSettings, "startup");
    } catch (settingsError) {
      error("settings", "Failed to load settings, using defaults", {
        error: String(settingsError)
      });
    }
  }

  function installStorageSync() {
    if (!chrome.storage || !chrome.storage.onChanged || !settingsApi) {
      warn("settings", "Storage sync listener unavailable");
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }

      const mergedSettings = {
        ...currentSettings
      };
      let hasRelevantChange = false;

      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!changes[key]) {
          continue;
        }

        mergedSettings[key] = changes[key].newValue;
        hasRelevantChange = true;
      }

      if (!hasRelevantChange) {
        return;
      }

      applySettings(settingsApi.normalizeSettings(mergedSettings), "storage-change");
    });
  }

  function handleDebugRequest(action) {
    if (action === "settings") {
      return {
        version: VERSION,
        settings: { ...currentSettings }
      };
    }

    if (action === "inspect") {
      return inspectCandidates("page-probe");
    }

    if (action === "trySkip") {
      return {
        success: trySkip("page-probe"),
        version: VERSION
      };
    }

    return {
      error: `Unknown action: ${action}`,
      version: VERSION
    };
  }

  function installPageProbe() {
    const script = document.createElement("script");
    script.dataset.crunchyrollSkipDebug = "true";
    script.textContent = `
      (() => {
        const prefix = ${JSON.stringify(DEBUG_PREFIX)};
        const version = ${JSON.stringify(VERSION)};
        const requestEvent = ${JSON.stringify(DEBUG_REQUEST_EVENT)};
        const responseEvent = ${JSON.stringify(DEBUG_RESPONSE_EVENT)};

        function request(action) {
          return new Promise((resolve) => {
            const requestId = Math.random().toString(36).slice(2);

            function onResponse(event) {
              if (!event.detail || event.detail.requestId !== requestId) {
                return;
              }

              document.removeEventListener(responseEvent, onResponse);
              resolve(event.detail.payload);
            }

            document.addEventListener(responseEvent, onResponse);
            document.dispatchEvent(new CustomEvent(requestEvent, {
              detail: {
                action,
                requestId
              }
            }));
          });
        }

        window.crunchyrollSkipDebug = {
          version,
          settings() {
            console.log(\`\${prefix} [probe] settings() called\`, { version });
            return request("settings").then((payload) => {
              console.log(\`\${prefix} [probe] settings() result\`, payload);
              return payload;
            });
          },
          focusState() {
            const state = {
              hasFocus: document.hasFocus(),
              visibilityState: document.visibilityState,
              activeElement: document.activeElement ? {
                tag: document.activeElement.tagName,
                id: document.activeElement.id || null,
                className: document.activeElement.className || null
              } : null
            };

            console.log(\`\${prefix} [probe] focusState() result\`, state);
            return state;
          },
          inspect() {
            console.log(\`\${prefix} [probe] inspect() called\`, { version });
            return request("inspect").then((payload) => {
              console.log(\`\${prefix} [probe] inspect() result\`, payload);
              return payload;
            });
          },
          trySkip() {
            console.log(\`\${prefix} [probe] trySkip() called\`, { version });
            return request("trySkip").then((payload) => {
              console.log(\`\${prefix} [probe] trySkip() result\`, payload);
              return payload;
            });
          }
        };

        console.log(\`\${prefix} [probe] window.crunchyrollSkipDebug installed\`, {
          version
        });
      })();
    `;

    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();

    log("init", "Page debug probe installed", {
      version: VERSION
    });
  }

  document.addEventListener(DEBUG_REQUEST_EVENT, (event) => {
    const detail = event.detail || {};
    const payload = handleDebugRequest(detail.action);

    document.dispatchEvent(new CustomEvent(DEBUG_RESPONSE_EVENT, {
      detail: {
        requestId: detail.requestId,
        payload
      }
    }));
  });

  log("init", "Content script loaded", {
    version: VERSION,
    href: window.location.href,
    pathname: window.location.pathname,
    isWatchPage: isWatchPage(),
    readyState: document.readyState
  });

  installPageProbe();
  installKeyboardDiagnostics();
  installStorageSync();
  startPersistentHideMaintenance();
  void loadSettings();
})();
