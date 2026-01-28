// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.

const fs = require('fs-extra');
const path = require('path');

const appDataPath = require('appdata-path')('initiald-card-selector');
const settingsFilePath = require('path').join(appDataPath, 'settings.json');

const lsDirectory = (source, includeFile, includeDir) => {
  console.log(`Listing directory: ${source}`);
  try {
    return fs.readdirSync(source, { withFileTypes: true })
      .filter(dirent => {
        return (includeFile && dirent.isFile()) || (includeDir && dirent.isDirectory());
      })
      .map(dirent => dirent.name);
  }
  catch (e) {
    console.warn(`Error reading directory ${source}:`, e);
    return [];
  }
}

let settings = {};
let appDir;
let absCardsFolder;
let absNvramFolder;

function reloadAbsolutePaths() {
  if (!appDir) return;
  absCardsFolder = path.join(appDir, settings.cardsFolder);
  absNvramFolder = path.join(appDir, settings.nvramFolder);
}
function loadSettings() {
  if (fs.existsSync(settingsFilePath)) {
    settings = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
  }
}

function saveSettings() {
  fs.ensureDirSync(path.dirname(settingsFilePath));
  fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));
  reloadAbsolutePaths();
}

loadSettings();

settings.game ??= 'initdv3';
settings.cardsFolder ??= './cards';
settings.nvramFolder ??= './data';
settings.cardFileNameSuffix ??= '.zip.card';

async function main() {

  let activeCards = {};
  let gameSelector, cardSelector;

  function refreshGameList() {
    const updatedGames = lsDirectory(absCardsFolder, false, true);
    
    // Clear existing options
    gameSelector.innerHTML = '';
    activeCards = {};
    
    // Repopulate games
    for (const game of updatedGames) {
      activeCards[game] = getActiveCardName(game);
      const option = document.createElement('option');
      option.value = game;
      option.innerText = game;
      gameSelector.appendChild(option);
    }
    
    // Set to first game if current selection doesn't exist
    if (!updatedGames.includes(settings.game) && updatedGames.length > 0) {
      settings.game = updatedGames[0];
    }
    
    gameSelector.value = settings.game;
    onGameChanged();
  }

  function onGameChanged() {
    settings.game = gameSelector.value;
    saveSettings();
    const cards = lsDirectory(`${absCardsFolder}/${settings.game}`, true);
    cardSelector.innerHTML = '';
    for (const card of cards) {
      const option = document.createElement('option');
      option.value = card;
      option.innerText = card.substring(0, card.lastIndexOf('.'));
      cardSelector.appendChild(option);
    }

    try {
      const loadedCard = getActiveCardName(settings.game);
      if (loadedCard !== null)
        cardSelector.value = loadedCard;
    }
    catch {

    }
  }

  function onLoadCardClick() {
    let load = true;
    if (!isActiveCardSaved(gameSelector.value))
      load = confirm('Active card has not been saved. Continue loading card?');
    if (!load)
      return;

    loadCard(gameSelector.value, cardSelector.value);
    alert('Card is loaded');
  }

  function onSaveCardClick() {
    const game = gameSelector.value;
    console.log(`Saving active card ${absNvramFolder}/${game}${settings.cardFileNameSuffix}`);
    if (!fs.existsSync(`${absNvramFolder}/${game}${settings.cardFileNameSuffix}`)) {
      alert('No active card to save.');
      return;
    }
    if (!fs.existsSync(`${absNvramFolder}/${game}.txt`)) {
      alert(`Unable to determine card name. Create ${game}.txt file.`);
      return;
    }
    saveActiveCard(game, getActiveCardName(game));
    alert('Card saved.');
  }

  function isActiveCardSaved(game) {
    const card = getActiveCardName(game);
    if (card === null)
      return true;
    return Buffer.compare(getActiveCardContents(game), getSavedCardContents(game, card)) === 0;
  }

  function getActiveCardName(game) {
    try { return fs.readFileSync(`${absNvramFolder}/${game}.txt`); }
    catch { return null; }
  }

  function getActiveCardContents(game) {
    try { return fs.readFileSync(`${absNvramFolder}/${game}${settings.cardFileNameSuffix}`); }
    catch { return null; }
  }

  function getSavedCardContents(game, card) {
    const cardPath = `${absCardsFolder}/${game}/${card}`;
    try { return fs.readFileSync(cardPath); }
    catch {
      console.error(`Error reading saved card: ${cardPath}`)
      return null;
    }
  }

  function saveActiveCard(game, card) {
    fs.copyFileSync(`${absNvramFolder}/${game}${settings.cardFileNameSuffix}`, `${absCardsFolder}/${game}/${card}`);
  }

  function loadCard(game, card) {
    fs.copyFileSync(`${absCardsFolder}/${game}/${card}`, `${absNvramFolder}/${game}${settings.cardFileNameSuffix}`);
    fs.writeFileSync(`${absNvramFolder}/${game}.txt`, card);
  }

  // Determine whether we're running in development or packaged.
  const execPath = process.execPath;
  const isDev = process.defaultApp
    || /electron/i.test(path.basename(execPath))
    || process.env.NODE_ENV === 'development';

  if (isDev) {
    // When running via `electron .` during development, `execPath` points
    // to the electron binary. Use the repository/project directory instead.
    appDir = process.cwd();
  }
  else {
    // Packaged app: use the directory containing the executable.
    appDir = process.env.PORTABLE_EXECUTABLE_DIR;
  }

  reloadAbsolutePaths();

  const games = lsDirectory(absCardsFolder, false, true);
  if (!games.includes(settings.game) && games.length > 0) {
    settings.game = games[0];
    saveSettings();
  }

  window.addEventListener('DOMContentLoaded', async () => {
    gameSelector = document.getElementById('games');
    cardSelector = document.getElementById('cards');
    
    const cardsFolderInput = document.getElementById('cards-folder');
    const nvramFolderInput = document.getElementById('nvram-folder');
    const cardSuffixInput = document.getElementById('card-suffix');

    // Set initial values from settings
    cardsFolderInput.value = settings.cardsFolder;
    nvramFolderInput.value = settings.nvramFolder;
    cardSuffixInput.value = settings.cardFileNameSuffix;

    // Save settings button click handler
    document.getElementById('save-settings').addEventListener('click', () => {
      settings.cardsFolder = cardsFolderInput.value;
      settings.nvramFolder = nvramFolderInput.value;
      settings.cardFileNameSuffix = cardSuffixInput.value;
      saveSettings();
      alert('Settings saved!');
      // Refresh the game list with new settings
      refreshGameList();
    });

    gameSelector.addEventListener('change', onGameChanged);

    for (const game of games) {
      activeCards[game] = getActiveCardName(game);
      const option = document.createElement('option');
      // if (game === defaultGame)
      //   option.selected = true;
      option.value = game;
      option.innerText = game;
      gameSelector.appendChild(option);
    }
    gameSelector.value = settings.game;

    onGameChanged();

    document.getElementById('load-card').addEventListener('click', onLoadCardClick);
    document.getElementById('save-card').addEventListener('click', onSaveCardClick);
  });
}

main();