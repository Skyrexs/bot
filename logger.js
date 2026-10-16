const fs = require('fs');
const path = require('path');
const config = require('./config');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[config.LOG_LEVEL] ?? LEVELS.info;

const logDir = path.resolve(__dirname, config.LOG_DIR);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFilePath = path.join(logDir, config.LOG_FILE);

function write(level, message, meta) {
  if (LEVELS[level] > currentLevel) return;

  const timestamp = new Date().toISOString();
  const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;

  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  consoleFn(line);

  try {
    fs.appendFileSync(logFilePath, line + '\n', { encoding: 'utf8' });
  } catch (e) {
    console.warn('Failed to write log to file', e.message);
  }
}

module.exports = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta),
};