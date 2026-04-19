(function () {
  const DEFAULT_SETTINGS = Object.freeze({
    enterToSkipEnabled: true,
    globalPlaybackKeysEnabled: true,
    hidePersistentSkipButtonsEnabled: true,
    hidePersistentSkipButtonsAfterSeconds: 7,
    debugLoggingEnabled: false,
    autoSkipRecapEnabled: false,
    autoSkipIntroEnabled: false,
    autoSkipCreditsEnabled: false,
    autoSkipDelaySeconds: 3,
    autoSkipSeriesBlacklist: {}
  });

  function clampHidePersistentSkipButtonsAfterSeconds(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return DEFAULT_SETTINGS.hidePersistentSkipButtonsAfterSeconds;
    }

    return Math.max(1, Math.round(numericValue));
  }

  function clampAutoSkipDelaySeconds(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return DEFAULT_SETTINGS.autoSkipDelaySeconds;
    }

    return Math.max(0, Math.round(numericValue));
  }

  function normalizeSettings(rawSettings) {
    const nextSettings = rawSettings || {};
    const blacklist = nextSettings.autoSkipSeriesBlacklist;
    const normalizedBlacklist = {};

    if (blacklist && typeof blacklist === "object") {
      for (const [key, value] of Object.entries(blacklist)) {
        if (typeof key !== "string" || !key.trim()) {
          continue;
        }

        normalizedBlacklist[key] = typeof value === "string" && value.trim()
          ? value.trim()
          : key;
      }
    }

    return {
      enterToSkipEnabled: typeof nextSettings.enterToSkipEnabled === "boolean"
        ? nextSettings.enterToSkipEnabled
        : DEFAULT_SETTINGS.enterToSkipEnabled,
      globalPlaybackKeysEnabled: typeof nextSettings.globalPlaybackKeysEnabled === "boolean"
        ? nextSettings.globalPlaybackKeysEnabled
        : DEFAULT_SETTINGS.globalPlaybackKeysEnabled,
      debugLoggingEnabled: typeof nextSettings.debugLoggingEnabled === "boolean"
        ? nextSettings.debugLoggingEnabled
        : DEFAULT_SETTINGS.debugLoggingEnabled,
      hidePersistentSkipButtonsEnabled: typeof nextSettings.hidePersistentSkipButtonsEnabled === "boolean"
        ? nextSettings.hidePersistentSkipButtonsEnabled
        : DEFAULT_SETTINGS.hidePersistentSkipButtonsEnabled,
      hidePersistentSkipButtonsAfterSeconds: clampHidePersistentSkipButtonsAfterSeconds(
        nextSettings.hidePersistentSkipButtonsAfterSeconds
      ),
      autoSkipRecapEnabled: typeof nextSettings.autoSkipRecapEnabled === "boolean"
        ? nextSettings.autoSkipRecapEnabled
        : DEFAULT_SETTINGS.autoSkipRecapEnabled,
      autoSkipIntroEnabled: typeof nextSettings.autoSkipIntroEnabled === "boolean"
        ? nextSettings.autoSkipIntroEnabled
        : DEFAULT_SETTINGS.autoSkipIntroEnabled,
      autoSkipCreditsEnabled: typeof nextSettings.autoSkipCreditsEnabled === "boolean"
        ? nextSettings.autoSkipCreditsEnabled
        : DEFAULT_SETTINGS.autoSkipCreditsEnabled,
      autoSkipDelaySeconds: clampAutoSkipDelaySeconds(
        nextSettings.autoSkipDelaySeconds
      ),
      autoSkipSeriesBlacklist: normalizedBlacklist
    };
  }

  function getSettings(storageArea) {
    const area = storageArea || chrome.storage.sync;

    return new Promise((resolve, reject) => {
      area.get(DEFAULT_SETTINGS, (items) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve(normalizeSettings(items));
      });
    });
  }

  function saveSettings(nextSettings, storageArea) {
    const area = storageArea || chrome.storage.sync;
    const normalizedSettings = normalizeSettings(nextSettings);

    return new Promise((resolve, reject) => {
      area.set(normalizedSettings, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve(normalizedSettings);
      });
    });
  }

  globalThis.CrunchyrollSkipSettings = {
    DEFAULT_SETTINGS,
    clampAutoSkipDelaySeconds,
    clampHidePersistentSkipButtonsAfterSeconds,
    normalizeSettings,
    getSettings,
    saveSettings
  };
})();
