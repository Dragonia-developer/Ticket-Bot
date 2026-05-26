const fs = require('node:fs');
const path = require('node:path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fillTemplate(input, data = {}) {
  if (typeof input !== 'string') return input;
  return input.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = data[key];
    return value === undefined || value === null ? `{${key}}` : String(value);
  });
}

function sanitizeChannelName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90) || 'ticket';
}

function parseConfigValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function getByPath(object, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => {
    if (current && Object.prototype.hasOwnProperty.call(current, key)) return current[key];
    return undefined;
  }, object);
}

function setByPath(object, dottedPath, value) {
  const keys = dottedPath.split('.');
  let current = object;
  for (const key of keys.slice(0, -1)) {
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) current[key] = {};
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function isStaff(member, config, category) {
  if (!member) return false;
  if (member.permissions.has('Administrator') || member.permissions.has('ManageGuild')) return true;
  const allowed = [
    ...(config.permissions?.adminRoles || []),
    ...(config.permissions?.managerRoles || []),
    ...(category?.supportRoleIds || [])
  ];
  return allowed.some((roleId) => member.roles.cache.has(roleId));
}

function businessHoursOpen(config, now = new Date()) {
  const hours = config.businessHours;
  if (!hours?.enabled) return true;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: hours.timezone || config.timezone || 'UTC',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const day = String(parts.weekday || '').toLowerCase();
  const ranges = hours.days?.[day] || [];
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return ranges.some((range) => {
    const [startHour, startMinute] = range.start.split(':').map(Number);
    const [endHour, endMinute] = range.end.split(':').map(Number);
    return minutes >= startHour * 60 + startMinute && minutes <= endHour * 60 + endMinute;
  });
}

module.exports = {
  businessHoursOpen,
  ensureDir,
  fillTemplate,
  getByPath,
  isStaff,
  parseConfigValue,
  readJson,
  sanitizeChannelName,
  setByPath,
  writeJson
};
