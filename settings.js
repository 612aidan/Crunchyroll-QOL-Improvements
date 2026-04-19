(function () {
  const DEFAULT_SETTINGS = Object.freeze({
    enterToSkipEnabled: true,
    globalPlaybackKeysEnabled: true,
    hidePersistentSkipButtonsEnabled: true,
    hidePersistentSkipButtonsAfterSeconds: 7
  });

  function clampHidePersistentSkipButtonsAfterSeconds(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return DEFAULT_SETTINGS.hidePersistentSkipButtonsAfterSeconds;
    }

    return Math.max(1, Math.round(numericValue));
  }

  function normalizeSettings(rawSettings) {
    const nextSettings = rawSettings || {};

    return {
      enterToSkipEnabled: typeof nextSettings.enterToSkipEnabled === "boolean"
        ? nextSettings.enterToSkipEnabled
        : DEFAULT_SETTINGS.enterToSkipEnabled,
      globalPlaybackKeysEnabled: typeof nextSettings.globalPlaybackKeysEnabled === "boolean"
        ? nextSettings.globalPlaybackKeysEnabled
        : DEFAULT_SETTINGS.globalPlaybackKeysEnabled,
      hidePersistentSkipButtonsEnabled: typeof nextSettings.hidePersistentSkipButtonsEnabled === "boolean"
        ? nextSettings.hidePersistentSkipButtonsEnabled
        : DEFAULT_SETTINGS.hidePersistentSkipButtonsEnabled,
      hidePersistentSkipButtonsAfterSeconds: clampHidePersistentSkipButtonsAfterSeconds(
        nextSettings.hidePersistentSkipButtonsAfterSeconds
      )
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
    clampHidePersistentSkipButtonsAfterSeconds,
    normalizeSettings,
    getSettings,
    saveSettings
  };
})();
