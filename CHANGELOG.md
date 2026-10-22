# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Which games Steam refused**: Settings → Steam lists the games whose achievements Steam didn't
  give on the last sync, each with Steam's answer and a link to the game.

### Changed

- **Phone navigation**: the tab bar is Bonfire, Library, Search, Fame and **Stats** (Stats had no tab);
  Settings is the gear at the top of each page. Game pages have a **Back** button, since the
  installed app has no browser back button.
- **Game pages on phones**: progress next to the title, status and platform side by side, the
  achievement filter stays at the top while scrolling, and rows lose the "locked" label the lock
  icon already shows.
- **Search on phones** lists results with a small cover instead of half-screen covers.
- Buttons, chips and checkboxes are finger-sized on phones; small labels are a little larger.

### Fixed

- **Pages wider than the phone** (content touching the right edge, the page sliding sideways): a
  long one-word title or game name stretched the layout past the screen. Pages now always fit,
  down to 320px, and long titles wrap or shrink.
- **iPhone zooming in** when tapping the library filter, the sort menu or the platform picker
  (text under 16px), and staying zoomed.
- Content no longer scrolls under the status bar in the installed app.
- **"Steam keeps this profile's game details private" on a public profile.** Steam refuses the
  achievements of some games (403) even on public profiles, and one refusal stopped the whole
  sync with that message. Such a game is now skipped and tried again on the next sync; the sync
  message says how many were skipped, and the app log names them. The message about private
  game details now only appears when Steam withholds the whole library.

## [0.1.0] - 2026-10-22

First version.

### Added

- **Steam import**: link a profile (link, custom URL or SteamID64) and every owned game arrives with
  playtime, achievements, unlock dates and global rarity, plus the public wishlist.
- **Sync**: recently played games every 15 minutes, the whole library nightly, and a Sync button on
  each game. Steam resets are mirrored.
- **Library** with statuses (Playing, Backlog, Unsorted, Beaten, On hold, Abandoned, Wishlist),
  sorting, a detail panel and one-tap sorting of imported games.
- **Game pages**: achievements locked first, rarity, hidden achievements blurred until revealed,
  notes and rating.
- **Any platform**: IGDB or Steam store search, games added by hand, Steam achievement lists ticked
  by hand for copies played elsewhere, and shared **checklists**.
- **Perfection**: 100% detection, a one-time "Perfection achieved" moment, the Hall of Fame.
- **Stats**, **notifications** (ntfy, Discord), household **accounts**, **backups**, installable
  **PWA**, and the **Ember** look.
- Docker image for amd64 and arm64, CasaOS app definition, docs.
