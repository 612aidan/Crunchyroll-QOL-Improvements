# Crunchyroll QOL Improvements

Chrome extension that lets `Enter` activate Crunchyroll skip controls when they are visible on episode watch pages and can hide persistent skip buttons after a configurable delay.

## Behavior

- Loads on Crunchyroll pages and only activates playback behavior on `watch` pages
- Pressing `Enter` clicks a visible skip control inside the player when one exists
- If no skip control is visible, `Enter` does nothing
- Ignores `Enter` while typing in inputs, textareas, selects, or editable fields
- Includes a popup menu with saved settings
- Can use left, right, and space to forward playback controls to the player even when it is not selected
- Can hide persistent `Skip Intro`, `Skip Recap`, and `Skip Credits` buttons after a configurable delay
- Logs detailed debug checkpoints to DevTools during diagnosis

## Settings

- `Enable Enter To Skip`: On by default
- `Enable Global Playback Keys`: On by default
- `Hide Persistent Skip Buttons`: On by default
- `Hide After Seconds`: `7` by default

The extension popup saves settings immediately with `chrome.storage.sync`, so changes apply to open Crunchyroll tabs without reloading.

## Supported Skip Labels

- `Skip Intro`
- `Skip Recap`
- `Skip Credits`
- `Skip Ad`
- `Skip Ads`

It also falls back to other visible controls containing the word `skip`, while avoiding unrelated actions like `Next Episode`.

## Debugging

- Reload the unpacked extension after changes in `chrome://extensions`
- Open DevTools on a Crunchyroll watch page and filter for `[Crunchyroll Skip Debug]`
- Use `window.crunchyrollSkipDebug.version` to confirm the latest debug build is loaded
- Use `window.crunchyrollSkipDebug.settings()` to inspect the current extension settings on the page
- Use `window.crunchyrollSkipDebug.focusState()` to inspect whether the page currently has focus
- Use `window.crunchyrollSkipDebug.inspect()` to print the current skip candidate analysis
- Use `window.crunchyrollSkipDebug.trySkip()` to manually run the same skip activation path without pressing `Enter`

## Install

1. Open `chrome://extensions`
2. Turn On `Developer Mode`
3. Click `Load Unpacked`
4. Select this folder:
   `/Users/aidan/Library/CloudStorage/Dropbox/[01] Aidan/[02] Personal Projects/[12] Chrome Extensions/Crunchyroll Enter to Skip Intro`

## Notes

Crunchyroll can change its player markup over time. This extension prefers stable text and ARIA labels over brittle utility classes so it is more resilient to layout changes.
