(function () {
  const settingsApi = globalThis.CrunchyrollSkipSettings;
  const DEFAULT_SETTINGS = settingsApi.DEFAULT_SETTINGS;
  const debugLoggingEnabledInput = document.getElementById("debugLoggingEnabled");
  const enterToSkipEnabledInput = document.getElementById("enterToSkipEnabled");
  const globalPlaybackKeysEnabledInput = document.getElementById("globalPlaybackKeysEnabled");
  const hidePersistentSkipButtonsEnabledInput = document.getElementById("hidePersistentSkipButtonsEnabled");
  const hidePersistentSkipButtonsAfterSecondsInput = document.getElementById("hidePersistentSkipButtonsAfterSeconds");
  const autoSkipRecapEnabledInput = document.getElementById("autoSkipRecapEnabled");
  const autoSkipIntroEnabledInput = document.getElementById("autoSkipIntroEnabled");
  const autoSkipCreditsEnabledInput = document.getElementById("autoSkipCreditsEnabled");
  const autoSkipDelaySecondsInput = document.getElementById("autoSkipDelaySeconds");
  const seriesAutoSkipDescription = document.getElementById("seriesAutoSkipDescription");
  const seriesAutoSkipToggleButton = document.getElementById("seriesAutoSkipToggle");
  const saveStatus = document.getElementById("saveStatus");
  let currentSettingsSnapshot = settingsApi.normalizeSettings(DEFAULT_SETTINGS);
  let currentSeriesContext = null;

  function setSaveStatus(message) {
    saveStatus.textContent = message;
  }

  function debugLogError(message, details) {
    if (!currentSettingsSnapshot.debugLoggingEnabled) {
      return;
    }

    if (typeof details === "undefined") {
      console.error(`[Crunchyroll Skip Popup] ${message}`);
      return;
    }

    console.error(`[Crunchyroll Skip Popup] ${message}`, details);
  }

  function hasAnyAutoSkipEnabled() {
    return (
      autoSkipRecapEnabledInput.checked ||
      autoSkipIntroEnabledInput.checked ||
      autoSkipCreditsEnabledInput.checked
    );
  }

  function syncDependentInputs() {
    hidePersistentSkipButtonsAfterSecondsInput.disabled = !hidePersistentSkipButtonsEnabledInput.checked;
    autoSkipDelaySecondsInput.disabled = !hasAnyAutoSkipEnabled();
  }

  function isSeriesBlacklisted(settings, seriesContext) {
    if (!seriesContext || !seriesContext.key) {
      return false;
    }

    return Boolean(settings.autoSkipSeriesBlacklist[seriesContext.key]);
  }

  function syncSeriesAutoSkipControl(settings) {
    const seriesContext = currentSeriesContext;

    if (!seriesContext || !seriesContext.key) {
      seriesAutoSkipDescription.textContent = "Open a Crunchyroll watch page to manage Auto Skip for the current series.";
      seriesAutoSkipToggleButton.textContent = "Unavailable";
      seriesAutoSkipToggleButton.disabled = true;
      return;
    }

    const blacklisted = isSeriesBlacklisted(settings, seriesContext);
    seriesAutoSkipDescription.textContent = blacklisted
      ? `Auto Skip is disabled for ${seriesContext.title}.`
      : `Auto Skip is enabled for ${seriesContext.title}.`;
    seriesAutoSkipToggleButton.textContent = blacklisted
      ? "Enable for This Series"
      : "Disable for This Series";
    seriesAutoSkipToggleButton.disabled = false;
  }

  async function loadCurrentSeriesContext() {
    if (!chrome.tabs || !chrome.tabs.query || !chrome.tabs.sendMessage) {
      currentSeriesContext = null;
      return;
    }

    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });
      const activeTab = tabs[0];

      if (!activeTab || typeof activeTab.id !== "number") {
        currentSeriesContext = null;
        return;
      }

      const response = await chrome.tabs.sendMessage(activeTab.id, {
        action: "currentSeriesContext"
      });

      currentSeriesContext = response && response.seriesContext
        ? response.seriesContext
        : null;
    } catch (error) {
      currentSeriesContext = null;
    }
  }

  function buildSettingsFromInputs() {
    return settingsApi.normalizeSettings({
      debugLoggingEnabled: debugLoggingEnabledInput.checked,
      enterToSkipEnabled: enterToSkipEnabledInput.checked,
      globalPlaybackKeysEnabled: globalPlaybackKeysEnabledInput.checked,
      hidePersistentSkipButtonsEnabled: hidePersistentSkipButtonsEnabledInput.checked,
      hidePersistentSkipButtonsAfterSeconds: hidePersistentSkipButtonsAfterSecondsInput.value,
      autoSkipRecapEnabled: autoSkipRecapEnabledInput.checked,
      autoSkipIntroEnabled: autoSkipIntroEnabledInput.checked,
      autoSkipCreditsEnabled: autoSkipCreditsEnabledInput.checked,
      autoSkipDelaySeconds: autoSkipDelaySecondsInput.value
    });
  }

  function applySettingsToInputs(settings) {
    currentSettingsSnapshot = settings;
    debugLoggingEnabledInput.checked = settings.debugLoggingEnabled;
    enterToSkipEnabledInput.checked = settings.enterToSkipEnabled;
    globalPlaybackKeysEnabledInput.checked = settings.globalPlaybackKeysEnabled;
    hidePersistentSkipButtonsEnabledInput.checked = settings.hidePersistentSkipButtonsEnabled;
    hidePersistentSkipButtonsAfterSecondsInput.value = String(settings.hidePersistentSkipButtonsAfterSeconds);
    autoSkipRecapEnabledInput.checked = settings.autoSkipRecapEnabled;
    autoSkipIntroEnabledInput.checked = settings.autoSkipIntroEnabled;
    autoSkipCreditsEnabledInput.checked = settings.autoSkipCreditsEnabled;
    autoSkipDelaySecondsInput.value = String(settings.autoSkipDelaySeconds);
    syncDependentInputs();
    syncSeriesAutoSkipControl(settings);
  }

  async function persistCurrentInputs(statusMessage) {
    const normalizedSettings = buildSettingsFromInputs();
    applySettingsToInputs(normalizedSettings);
    setSaveStatus(statusMessage || "Saving settings...");

    try {
      await settingsApi.saveSettings(normalizedSettings);
      setSaveStatus("Settings saved.");
    } catch (saveError) {
      debugLogError("Failed to save settings", saveError);
      setSaveStatus("Could not save settings.");
    }
  }

  async function initializePopup() {
    applySettingsToInputs(DEFAULT_SETTINGS);
    setSaveStatus("Loading settings...");

    try {
      const [storedSettings] = await Promise.all([
        settingsApi.getSettings(),
        loadCurrentSeriesContext()
      ]);
      applySettingsToInputs(storedSettings);
      setSaveStatus("");
    } catch (loadError) {
      debugLogError("Failed to load settings", loadError);
      await loadCurrentSeriesContext();
      syncSeriesAutoSkipControl(currentSettingsSnapshot);
      setSaveStatus("Using default settings.");
    }
  }

  seriesAutoSkipToggleButton.addEventListener("click", async () => {
    if (!currentSeriesContext || !currentSeriesContext.key) {
      return;
    }

    const normalizedSettings = buildSettingsFromInputs();
    const nextBlacklist = {
      ...currentSettingsSnapshot.autoSkipSeriesBlacklist
    };

    if (nextBlacklist[currentSeriesContext.key]) {
      delete nextBlacklist[currentSeriesContext.key];
      setSaveStatus("Enabling Auto Skip for Series...");
    } else {
      nextBlacklist[currentSeriesContext.key] = currentSeriesContext.title;
      setSaveStatus("Disabling Auto Skip for Series...");
    }

    const nextSettings = settingsApi.normalizeSettings({
      ...currentSettingsSnapshot,
      ...normalizedSettings,
      autoSkipSeriesBlacklist: nextBlacklist
    });

    applySettingsToInputs(nextSettings);

    try {
      await settingsApi.saveSettings(nextSettings);
      currentSettingsSnapshot = nextSettings;
      syncSeriesAutoSkipControl(nextSettings);
      setSaveStatus("Settings saved.");
    } catch (saveError) {
      debugLogError("Failed to save series blacklist", saveError);
      syncSeriesAutoSkipControl(currentSettingsSnapshot);
      setSaveStatus("Could not save settings.");
    }
  });

  debugLoggingEnabledInput.addEventListener("change", async () => {
    await persistCurrentInputs("Saving Debug Logging...");
  });

  enterToSkipEnabledInput.addEventListener("change", async () => {
    await persistCurrentInputs("Saving Enter To Skip...");
  });

  globalPlaybackKeysEnabledInput.addEventListener("change", async () => {
    await persistCurrentInputs("Saving Global Playback Keys...");
  });

  hidePersistentSkipButtonsEnabledInput.addEventListener("change", async () => {
    syncDependentInputs();
    await persistCurrentInputs("Saving Persistent Skip Button Hiding...");
  });

  hidePersistentSkipButtonsAfterSecondsInput.addEventListener("change", async () => {
    await persistCurrentInputs("Saving Hide Delay...");
  });

  hidePersistentSkipButtonsAfterSecondsInput.addEventListener("blur", () => {
    const normalizedValue = settingsApi.clampHidePersistentSkipButtonsAfterSeconds(
      hidePersistentSkipButtonsAfterSecondsInput.value
    );
    hidePersistentSkipButtonsAfterSecondsInput.value = String(normalizedValue);
  });

  autoSkipRecapEnabledInput.addEventListener("change", async () => {
    syncDependentInputs();
    await persistCurrentInputs("Saving Auto Skip Recap...");
  });

  autoSkipIntroEnabledInput.addEventListener("change", async () => {
    syncDependentInputs();
    await persistCurrentInputs("Saving Auto Skip Intro...");
  });

  autoSkipCreditsEnabledInput.addEventListener("change", async () => {
    syncDependentInputs();
    await persistCurrentInputs("Saving Auto Skip Credits...");
  });

  autoSkipDelaySecondsInput.addEventListener("change", async () => {
    await persistCurrentInputs("Saving Auto Skip Delay...");
  });

  autoSkipDelaySecondsInput.addEventListener("blur", () => {
    const normalizedValue = settingsApi.clampAutoSkipDelaySeconds(
      autoSkipDelaySecondsInput.value
    );
    autoSkipDelaySecondsInput.value = String(normalizedValue);
  });

  void initializePopup();
})();
