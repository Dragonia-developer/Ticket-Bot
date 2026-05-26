const fs = require('node:fs');
const path = require('node:path');
const { setByPath, writeJson } = require('./utils');

const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'config.json');
const examplePath = path.join(root, 'config.example.json');

let config = loadConfig();

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    if (!fs.existsSync(examplePath)) throw new Error('Missing config.json and config.example.json.');
    fs.copyFileSync(examplePath, configPath);
  }
  delete require.cache[require.resolve(configPath)];
  return require(configPath);
}

function reloadConfig() {
  config = loadConfig();
  return config;
}

function getConfig() {
  return config;
}

function saveConfig(nextConfig = config) {
  config = nextConfig;
  writeJson(configPath, config);
  return config;
}

function updateConfig(dottedPath, value) {
  setByPath(config, dottedPath, value);
  saveConfig(config);
  return config;
}

module.exports = {
  configPath,
  getConfig,
  reloadConfig,
  saveConfig,
  updateConfig
};
