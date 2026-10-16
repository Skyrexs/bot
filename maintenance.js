const fs = require('fs');
const path = require('path');
const db = require('../database');
const config = require('../config');
const logger = require('../logger');

function backupDir() {
  const dir = path.resolve(__dirname, '..', config.BACKUP_DIR || 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function createDatabaseBackup(reason = 'manual') {
  const dir = backupDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `bot-${stamp}-${String(reason).replace(/[^a-z0-9_-]/gi, '_')}.db`;
  const destination = path.join(dir, fileName);

  try {
    if (typeof db.db.backup === 'function') {
      await db.db.backup(destination);
    } else {
      db.db.pragma('wal_checkpoint(PASSIVE)');
      fs.copyFileSync(path.join(__dirname, '..', 'bot.db'), destination);
    }

    const stat = fs.statSync(destination);
    db.createBackupRecord(fileName, stat.size);
    const keep = Math.max(3, Number(config.BACKUP_KEEP || 14));
    const records = db.getRecentBackups(1000);
    for (const row of records.slice(keep)) {
      const oldPath = path.join(dir, row.fileName);
      try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch {}
    }
    db.pruneBackupRecords(keep);
    logger.info('Database backup created', { fileName, sizeBytes: stat.size, reason });
    return { ok: true, fileName, sizeBytes: stat.size };
  } catch (e) {
    logger.error('Database backup failed', { error: e.message, stack: e.stack, destination });
    return { ok: false, error: e.message };
  }
}

async function maybeCreateDailyBackup() {
  const latest = db.getRecentBackups(1)[0];
  if (latest && Date.now() - Number(latest.createdAt) < 20 * 60 * 60 * 1000) return { skipped: true };
  return createDatabaseBackup('daily');
}

module.exports = { createDatabaseBackup, maybeCreateDailyBackup, backupDir };
