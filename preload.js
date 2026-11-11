// SPDX-FileCopyrightText: 2026 BeatBayashi contributors
//
// SPDX-License-Identifier: MIT-0

// Electron Preload Script
// Provides secure bridge between main and renderer processes

// Sandboxed preloads can only require a small set of modules (not files
// such as ./package.json), so main passes the version via additionalArguments.
const { contextBridge } = require('electron');

const VERSION_ARG = '--beatbayashi-version=';
const versionArg = process.argv.find((a) => a.startsWith(VERSION_ARG));
const appVersion = versionArg ? versionArg.slice(VERSION_ARG.length) : '';

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  arch: process.arch,
  appVersion
});
