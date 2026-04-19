# Crunchyroll QOL Improvements

Chrome extension that adds quality-of-life controls for Crunchyroll watch pages, including skip keybinds, Auto Skip controls, and persistent skip-button hiding.

Repository: [612aidan/Crunchyroll-QOL-Improvements](https://github.com/612aidan/Crunchyroll-QOL-Improvements)

## Behavior

- Loads on Crunchyroll pages and only activates playback behavior on `watch` pages
- Pressing `Enter` clicks a visible skip control inside the player when one exists
- If no skip control is visible, `Enter` does nothing
- Ignores `Enter` while typing in inputs, textareas, selects, or editable fields
- Includes a popup menu with saved settings
- Can use left, right, and space to forward playback controls to the player even when it is not selected
- Can hide persistent `Skip Intro`, `Skip Recap`, and `Skip Credits` buttons after a configurable delay
- Can automatically skip `Recap`, `Intro`, and `Credits` independently
- Can delay Auto Skip with a shared countdown, including `0` for instant skip
- Can pause the Auto Skip countdown while playback is paused
- Can cancel the active Auto Skip countdown by hovering the skip button and clicking `Cancel Auto Skip`
- Can disable Auto Skip for a specific series from the popup

## Settings

- `Hide Persistent Skip Buttons`: On by default
- `Hide After Seconds`: `7` by default
- `Auto Skip Recap`: Off by default
- `Auto Skip Intro`: Off by default
- `Auto Skip Credits`: Off by default
- `Auto Skip Delay`: `3` by default and supports `0` for instant skip
- `Series Blacklist`: Per-series Auto Skip toggle for the currently open Crunchyroll watch page
- `Enable Enter To Skip Keybind`: On by default
- `Enable Playback Keybinds`: On by default
- `Enable Debug Logging`: Off by default

The `Series Blacklist` control appears in the popup when the active tab is a Crunchyroll watch page with detectable series information.

The Auto Skip countdown:
- Applies separately to recap, intro, and credits based on which toggles are enabled
- Pauses when the video is paused
- Cancels if the user explicitly cancels the active Auto Skip button
- Resets when playback position changes or the skip-button context changes

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
- Turn on `Enable Debug Logging` in the popup before checking DevTools output
- Open DevTools on a Crunchyroll watch page and filter for `[Crunchyroll Skip Debug]`

## Install

- GitHub repository: [612aidan/Crunchyroll-QOL-Improvements](https://github.com/612aidan/Crunchyroll-QOL-Improvements)
- Clone or download the repo, then load the extension unpacked from `chrome://extensions`
