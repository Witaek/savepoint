# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
