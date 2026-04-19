(function () {
  const settingsApi = globalThis.CrunchyrollSkipSettings;
  const DEFAULT_SETTINGS = settingsApi.DEFAULT_SETTINGS;
  const enterToSkipEnabledInput = document.getElementById("enterToSkipEnabled");
  const globalPlaybackKeysEnabledInput = document.getElementById("globalPlaybackKeysEnabled");
  const hidePersistentSkipButtonsEnabledInput = document.getElementById("hidePersistentSkipButtonsEnabled");
  const hidePersistentSkipButtonsAfterSecondsInput = document.getElementById("hidePersistentSkipButtonsAfterSeconds");
  const saveStatus = document.getElementById("saveStatus");

  function setSaveStatus(message) {
    saveStatus.textContent = message;
  }

  function buildSettingsFromInputs() {
    return settingsApi.normalizeSettings({
      enterToSkipEnabled: enterToSkipEnabledInput.checked,
      globalPlaybackKeysEnabled: globalPlaybackKeysEnabledInput.checked,
      hidePersistentSkipButtonsEnabled: hidePersistentSkipButtonsEnabledInput.checked,
      hidePersistentSkipButtonsAfterSeconds: hidePersistentSkipButtonsAfterSecondsInput.value
    });
  }

  function applySettingsToInputs(settings) {
    enterToSkipEnabledInput.checked = settings.enterToSkipEnabled;
    globalPlaybackKeysEnabledInput.checked = settings.globalPlaybackKeysEnabled;
    hidePersistentSkipButtonsEnabledInput.checked = settings.hidePersistentSkipButtonsEnabled;
    hidePersistentSkipButtonsAfterSecondsInput.value = String(settings.hidePersistentSkipButtonsAfterSeconds);
    hidePersistentSkipButtonsAfterSecondsInput.disabled = !settings.hidePersistentSkipButtonsEnabled;
  }

  async function persistCurrentInputs(statusMessage) {
    const normalizedSettings = buildSettingsFromInputs();
    applySettingsToInputs(normalizedSettings);
    setSaveStatus(statusMessage || "Saving settings...");

    try {
      await settingsApi.saveSettings(normalizedSettings);
      setSaveStatus("Settings saved.");
    } catch (saveError) {
      console.error("[Crunchyroll Skip Popup] Failed to save settings", saveError);
      setSaveStatus("Could not save settings.");
    }
  }

  async function initializePopup() {
    applySettingsToInputs(DEFAULT_SETTINGS);
    setSaveStatus("Loading settings...");

    try {
      const storedSettings = await settingsApi.getSettings();
      applySettingsToInputs(storedSettings);
      setSaveStatus("Settings save automatically.");
    } catch (loadError) {
      console.error("[Crunchyroll Skip Popup] Failed to load settings", loadError);
      setSaveStatus("Using default settings.");
    }
  }

  enterToSkipEnabledInput.addEventListener("change", async () => {
    await persistCurrentInputs("Saving Enter To Skip...");
  });

  globalPlaybackKeysEnabledInput.addEventListener("change", async () => {
    await persistCurrentInputs("Saving Global Playback Keys...");
  });

  hidePersistentSkipButtonsEnabledInput.addEventListener("change", async () => {
    hidePersistentSkipButtonsAfterSecondsInput.disabled = !hidePersistentSkipButtonsEnabledInput.checked;
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

  void initializePopup();
})();
