const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'bot.db'));
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const ensureColumn = (table, column, definition) => {
  try {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    const exists = columns.some((c) => c.name === column);
    if (!exists) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`✓ Added column ${table}.${column}`);
    }
  } catch (e) {
    console.log(`⚠ Migration ${table}.${column}: ${e.message}`);
  }
};


const migrateVoiceSessionsSchema = () => {
  try {
    const columns = db.prepare('PRAGMA table_info(voice_sessions)').all();
    if (!columns.length) return;

    const pkByName = new Map(columns.map((c) => [c.name, c.pk]));
    const needsMigration = pkByName.get('userId') === 1 && pkByName.get('guildId') !== 1;

    if (!needsMigration) return;

    db.exec('BEGIN');
    try {
      db.exec(`
        CREATE TABLE voice_sessions_new (
          userId TEXT NOT NULL,
          guildId TEXT NOT NULL,
          channelId TEXT,
          joinedAt INTEGER NOT NULL,
          lastAwardAt INTEGER NOT NULL,
          PRIMARY KEY (userId, guildId)
        )
      `);

      db.exec(`
        INSERT OR REPLACE INTO voice_sessions_new
          (userId,guildId,channelId,joinedAt,lastAwardAt)
        SELECT userId,
               COALESCE(NULLIF(guildId, ''), 'unknown'),
               channelId,
               joinedAt,
               lastAwardAt
        FROM voice_sessions
      `);

      db.exec('DROP TABLE voice_sessions');
      db.exec('ALTER TABLE voice_sessions_new RENAME TO voice_sessions');
      db.exec('COMMIT');
      console.log('✓ Migrated voice_sessions to guild-scoped primary key');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      throw e;
    }
  } catch (e) {
    console.log(`⚠ Migration voice_sessions: ${e.message}`);
  }
};


const migrateAfkUsersSchema = () => {
  try {
    const columns = db.prepare('PRAGMA table_info(afk_users)').all();
    if (!columns.length) return;

    const pkByName = new Map(columns.map((c) => [c.name, c.pk]));
    const needsMigration = pkByName.get('userId') === 1 && pkByName.get('guildId') !== 1;

    if (!needsMigration) return;

    db.exec('BEGIN');
    try {
      db.exec(`
        CREATE TABLE afk_users_new (
          userId TEXT NOT NULL,
          guildId TEXT NOT NULL,
          afkAt INTEGER NOT NULL,
          reason TEXT,
          lastActivityAt INTEGER,
          PRIMARY KEY (userId, guildId)
        )
      `);
      db.exec(`
        INSERT OR REPLACE INTO afk_users_new
          (userId,guildId,afkAt,reason,lastActivityAt)
        SELECT userId,
               guildId,
               afkAt,
               reason,
               lastActivityAt
        FROM afk_users
      `);
      db.exec('DROP TABLE afk_users');
      db.exec('ALTER TABLE afk_users_new RENAME TO afk_users');
      db.exec('COMMIT');
      console.log('✓ Migrated afk_users to guild-scoped primary key');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      throw e;
    }
  } catch (e) {
    console.log(`⚠ Migration afk_users: ${e.message}`);
  }
};

const APPLICATIONS_SCHEMA = [
  { name: 'userId', def: 'TEXT PRIMARY KEY' },
  { name: 'userTag', def: "TEXT NOT NULL DEFAULT ''" },
  { name: 'age', def: 'TEXT' },
  { name: 'level', def: 'TEXT' },
  { name: 'nickname', def: 'TEXT' },
  { name: 'reason', def: 'TEXT' },
  { name: 'onlineAndExp', def: 'TEXT' },
  { name: 'messageId', def: 'TEXT' },
  { name: 'createdAt', def: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'answers', def: 'TEXT' },
  { name: 'status', def: "TEXT DEFAULT 'pending'" },
  { name: 'submittedAt', def: 'INTEGER' },
];

const addToBlacklist = (userId, username, reason, addedBy) => {
  db.prepare(`INSERT OR REPLACE INTO blacklist (userId,username,reason,addedBy,addedAt) VALUES (?,?,?,?,?)`)
    .run(userId, username, reason, addedBy, Date.now());
};

const removeFromBlacklist = (userId) => {
  db.prepare('DELETE FROM blacklist WHERE userId = ?').run(userId);
};

const getBlacklist = () => db.prepare('SELECT * FROM blacklist ORDER BY addedAt DESC').all();

const setCooldown = (userId, expiresAt) => {
  const ts = expiresAt instanceof Date ? expiresAt.getTime() : expiresAt;
  db.prepare(`INSERT OR REPLACE INTO cooldowns (userId,expiresAt) VALUES (?,?)`).run(userId, ts);
};

const getCooldown = (userId) => {
  const row = db.prepare('SELECT * FROM cooldowns WHERE userId = ?').get(userId);
  if (!row) return null;
  return { userId, expiresAt: new Date(row.expiresAt) };
};

const removeCooldown = (userId) => db.prepare('DELETE FROM cooldowns WHERE userId = ?').run(userId);

const cleanExpiredCooldowns = () => {
  const result = db.prepare('DELETE FROM cooldowns WHERE expiresAt < ?').run(Date.now());
  if (result.changes > 0) console.log(`✓ Cleaned cooldowns: ${result.changes}`);
};

const saveCaught = (captData) => {
  const captId = 'capt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  db.prepare(`INSERT INTO capts (id,channelId,time,createdBy,createdAt,main,subs,messageId) VALUES (?,?,?,?,?,?,?,?)`)
    .run(captId, captData.channelId, captData.time, captData.createdBy, captData.createdAt,
      JSON.stringify(captData.main || []), JSON.stringify(captData.subs || []), captData.messageId || null);
  return captId;
};

const _parseRoster = (row) => {
  if (!row) return null;
  let main = [], subs = [];
  try { main = JSON.parse(row.main || '[]'); } catch (e) { main = []; }
  try { subs = JSON.parse(row.subs || '[]'); } catch (e) { subs = []; }
  return {
    id: row.id, channelId: row.channelId, time: row.time,
    createdBy: row.createdBy, createdAt: row.createdAt,
    main, subs, messageId: row.messageId,
    reminderSent: row.reminderSent === 1,
    reminderDate: row.reminderDate || null,
  };
};

const getCaughtList = (captId) => _parseRoster(db.prepare('SELECT * FROM capts WHERE id=?').get(captId));
const getAllCaughtLists = () => db.prepare('SELECT * FROM capts ORDER BY createdAt DESC').all().map(_parseRoster);

const updateCaughtList = (captId, updates) => {
  if (!updates || !Object.keys(updates).length) return;
  const data = { ...updates };
  if (Array.isArray(data.main)) data.main = JSON.stringify(data.main);
  if (Array.isArray(data.subs)) data.subs = JSON.stringify(data.subs);
  const fields = Object.keys(data).map(k => `${k}=?`).join(',');
  db.prepare(`UPDATE capts SET ${fields} WHERE id=?`).run(...Object.values(data), captId);
};

const deleteCaughtFromDB = (captId) => db.prepare('DELETE FROM capts WHERE id=?').run(captId);
const deleteCaughtByChannel = (channelId) => db.prepare('DELETE FROM capts WHERE channelId=?').run(channelId);

const clearAllRosters = () => {
  db.prepare('DELETE FROM capts').run();
  db.prepare('DELETE FROM mcls').run();
  console.log('✓ All CAPT and MCL rosters cleared on restart');
};

const saveMCL = (mclData) => {
  const mclId = 'mcl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  db.prepare(`INSERT INTO mcls (id,channelId,time,createdBy,createdAt,main,subs,messageId) VALUES (?,?,?,?,?,?,?,?)`)
    .run(mclId, mclData.channelId, mclData.time, mclData.createdBy, mclData.createdAt,
      JSON.stringify(mclData.main || []), JSON.stringify(mclData.subs || []), mclData.messageId || null);
  return mclId;
};

const getMCLList = (mclId) => _parseRoster(db.prepare('SELECT * FROM mcls WHERE id=?').get(mclId));
const getAllMCLLists = () => db.prepare('SELECT * FROM mcls ORDER BY createdAt DESC').all().map(_parseRoster);

const updateMCLList = (mclId, updates) => {
  if (!updates || !Object.keys(updates).length) return;
  const data = { ...updates };
  if (Array.isArray(data.main)) data.main = JSON.stringify(data.main);
  if (Array.isArray(data.subs)) data.subs = JSON.stringify(data.subs);
  const fields = Object.keys(data).map(k => `${k}=?`).join(',');
  db.prepare(`UPDATE mcls SET ${fields} WHERE id=?`).run(...Object.values(data), mclId);
};

const deleteMCLFromDB = (mclId) => db.prepare('DELETE FROM mcls WHERE id=?').run(mclId);
const deleteMCLByChannel = (channelId) => db.prepare('DELETE FROM mcls WHERE channelId=?').run(channelId);

const setAFK = (userId, guildId, reason = null) => {
  const now = Date.now();
  db.prepare(`INSERT OR REPLACE INTO afk_users (userId,guildId,afkAt,reason,lastActivityAt) VALUES (?,?,?,?,?)`)
    .run(userId, guildId, now, reason || null, now);
};

const removeAFK = (userId, guildId) => {
  db.prepare('DELETE FROM afk_users WHERE userId=? AND guildId=?').run(userId, guildId);
};

const getAFK = (userId, guildId) => {
  return db.prepare('SELECT * FROM afk_users WHERE userId=? AND guildId=?').get(userId, guildId);
};

const getAllAFK = (guildId) => {
  return db.prepare('SELECT * FROM afk_users WHERE guildId=? ORDER BY afkAt DESC').all(guildId);
};

const saveApplication = (data) => {
  const cols = db.prepare('PRAGMA table_info(applications)').all().map(c => c.name);

  const answersJson = JSON.stringify([
    { label: 'Имя Фамилия и Статик',    value: data.nickname     || '' },
    { label: 'Возраст',                  value: data.age          || '' },
    { label: 'Часовой пояс и онлайн',    value: data.level        || '' },
    { label: 'О себе',                   value: data.reason       || '' },
    { label: 'Почему именно мы',         value: data.onlineAndExp || '' },
  ]);

  const id = `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();

  const insertCols = [];
  const insertVals = [];

  const push = (col, val) => { insertCols.push(col); insertVals.push(val); };

  if (cols.includes('id'))            push('id',            id);
  if (cols.includes('userId'))        push('userId',        data.userId);
  if (cols.includes('username'))      push('username',      data.userTag || '');
  if (cols.includes('userTag'))       push('userTag',       data.userTag || '');
  if (cols.includes('status'))        push('status',        'pending');
  if (cols.includes('answers'))       push('answers',       answersJson);
  if (cols.includes('submittedAt'))   push('submittedAt',   now);
  if (cols.includes('createdAt'))     push('createdAt',     now);
  if (cols.includes('messageId'))     push('messageId',     data.messageId || null);
  if (cols.includes('age'))           push('age',           data.age        || null);
  if (cols.includes('level'))         push('level',         data.level      || null);
  if (cols.includes('nickname'))      push('nickname',      data.nickname   || null);
  if (cols.includes('reason'))        push('reason',        data.reason     || null);
  if (cols.includes('onlineAndExp'))  push('onlineAndExp',  data.onlineAndExp || null);

  const placeholders = insertCols.map(() => '?').join(',');
  db.prepare(`INSERT OR REPLACE INTO applications (${insertCols.join(',')}) VALUES (${placeholders})`).run(...insertVals);
};

const getApplication = (userId) => db.prepare('SELECT * FROM applications WHERE userId=?').get(userId) || null;
const setApplicationMessageId = (userId, messageId) => db.prepare('UPDATE applications SET messageId=? WHERE userId=?').run(messageId, userId);
const deleteApplication = (userId) => db.prepare('DELETE FROM applications WHERE userId=?').run(userId);

const createTierTicket = (userId, channelId, answers, messageId) => {
  const id = 'ticket_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  db.prepare('INSERT INTO tier_tickets (id,userId,channelId,messageId,status,createdAt) VALUES (?,?,?,?,?,?)')
    .run(id, userId, channelId, messageId || null, 'open', Date.now());
  return id;
};

const deleteTierApplicationByUser = (userId) => db.prepare('DELETE FROM tier_applications WHERE userId=?').run(userId);
const deleteTierTicketByUser = (userId) => db.prepare('DELETE FROM tier_tickets WHERE userId=?').run(userId);
const getOpenTierTicketByUser = (userId) => db.prepare('SELECT * FROM tier_tickets WHERE userId=? AND status = \'open\' ORDER BY createdAt DESC LIMIT 1').get(userId) || null;
const getTierTicketByChannel = (channelId) => db.prepare('SELECT * FROM tier_tickets WHERE channelId=? ORDER BY createdAt DESC LIMIT 1').get(channelId) || null;
const deleteTierTicketByChannel = (channelId) => {
  const rows = db.prepare('SELECT userId FROM tier_tickets WHERE channelId=?').all(channelId);
  const tx = db.transaction(() => {
    const result = db.prepare('DELETE FROM tier_tickets WHERE channelId=?').run(channelId);
    for (const row of rows) db.prepare('DELETE FROM tier_applications WHERE userId=?').run(row.userId);
    return result.changes;
  });
  return tx();
};
const closeTierTicket = (id) => db.prepare('UPDATE tier_tickets SET status=?, closedAt=? WHERE id=?').run('closed', Date.now(), id);

const createPointsRequest = (data) => {
  const id = 'pr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  db.prepare(`INSERT INTO points_requests (id,userId,type,reasonType,name,proof,details,amount,status,messageId,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, data.userId, data.type, data.reasonType || null, data.name || null, data.proof || null, data.details || null, data.amount || null, 'pending', data.messageId || null, Date.now());
  return id;
};

const getPointsRequest = (id) => db.prepare('SELECT * FROM points_requests WHERE id=?').get(id) || null;

const updatePointsRequest = (id, updates) => {
  if (!updates || !Object.keys(updates).length) return;
  const data = { ...updates };
  const fields = Object.keys(data).map(k => `${k}=?`).join(',');
  db.prepare(`UPDATE points_requests SET ${fields} WHERE id=?`).run(...Object.values(data), id);
};


const claimPointsRequest = (id, reviewerId) => {
  const result = db.prepare(
    `UPDATE points_requests
     SET status='processing', reviewerId=?, handledAt=?
     WHERE id=? AND status='pending'`
  ).run(reviewerId || null, Date.now(), id);
  return result.changes === 1;
};

const recoverProcessingPointsRequests = () => {
  return db.prepare(
    `UPDATE points_requests
     SET status='pending', reviewerId=NULL, handledAt=NULL
     WHERE status='processing'`
  ).run().changes;
};

const setPointsRequestStatus = (id, status, reviewerId = null, amount = null) => {
  const updates = { status, reviewerId, handledAt: Date.now() };
  if (amount !== null) updates.amount = amount;
  updatePointsRequest(id, updates);
};

const removePoints = (userId, amount, meta = {}) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return false;

  const tx = db.transaction(() => {
    const row = db.prepare('SELECT * FROM points WHERE userId=?').get(userId);
    if (!row) return false;

    const newVal = Number(row.points) - numericAmount;
    if (newVal < 0) return false;

    db.prepare('UPDATE points SET points = ? WHERE userId = ?').run(newVal, userId);

    db.prepare(`
      INSERT INTO points_transactions
        (userId,type,amount,balanceAfter,reason,relatedRequestId,performedBy,createdAt)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      userId,
      meta.type || 'manual_remove',
      -numericAmount,
      newVal,
      meta.reason || null,
      meta.relatedRequestId || null,
      meta.performedBy || null,
      Date.now()
    );

    return true;
  });

  return tx();
};

const getPoints = (userId) => {
  const row = db.prepare('SELECT * FROM points WHERE userId=?').get(userId);
  return row ? Number(row.points) : 0;
};

const getTopPoints = (limit = 10) => db.prepare('SELECT userId, points FROM points WHERE points > 0 ORDER BY points DESC LIMIT ?').all(limit);

const resetAllPoints = (userIds = null, performedBy = null, reason = 'Обнуление баллов семьи') => {
  const ids = Array.isArray(userIds)
    ? [...new Set(userIds.filter((id) => /^\d+$/.test(String(id))))]
    : null;

  const rows = ids
    ? (ids.length
      ? db.prepare(`SELECT userId, points FROM points WHERE userId IN (${ids.map(() => '?').join(',')}) AND points != 0`).all(...ids)
      : [])
    : db.prepare('SELECT userId, points FROM points WHERE points != 0').all();

  const tx = db.transaction(() => {
    const now = Date.now();

    for (const row of rows) {
      db.prepare('UPDATE points SET points = 0, voiceLastJoin = CASE WHEN voiceLastJoin IS NULL THEN NULL ELSE ? END WHERE userId = ?')
        .run(now, row.userId);

      db.prepare(`INSERT INTO points_transactions
        (userId,type,amount,balanceAfter,reason,relatedRequestId,performedBy,createdAt)
        VALUES (?,?,?,?,?,?,?,?)`).run(
          row.userId,
          'reset_all',
          -Number(row.points || 0),
          0,
          reason,
          null,
          performedBy,
          now
        );
    }

    if (ids?.length) {
      db.prepare(`
        UPDATE voice_sessions
        SET joinedAt = ?, lastAwardAt = ?
        WHERE userId IN (${ids.map(() => '?').join(',')})
      `).run(now, now, ...ids);
    } else {
      db.prepare('UPDATE voice_sessions SET joinedAt = ?, lastAwardAt = ?')
        .run(now, now);
    }

    if (ids?.length) {
      db.prepare(`
        UPDATE points
        SET voiceLastJoin = CASE
          WHEN EXISTS (SELECT 1 FROM voice_sessions vs WHERE vs.userId = points.userId)
          THEN ? ELSE NULL END
        WHERE userId IN (${ids.map(() => '?').join(',')})
      `).run(now, ...ids);
    }
  });

  tx();
  return rows.length;
};

const sessionKey = (userId, guildId) => `${guildId || 'unknown'}:${userId}`;

const voiceJoin = (userId, guildId = null, channelId = null) => {
  const safeGuildId = guildId || 'unknown';
  const now = Date.now();
  const existing = db.prepare(
    'SELECT * FROM voice_sessions WHERE userId=? AND guildId=?'
  ).get(userId, safeGuildId);

  if (!existing) {
    db.prepare(`
      INSERT INTO voice_sessions (userId,guildId,channelId,joinedAt,lastAwardAt)
      VALUES (?,?,?,?,?)
    `).run(userId, safeGuildId, channelId || null, now, now);
  } else {
    db.prepare(`
      UPDATE voice_sessions
      SET channelId=?
      WHERE userId=? AND guildId=?
    `).run(channelId || existing.channelId || null, userId, safeGuildId);
  }

  const row = db.prepare('SELECT * FROM points WHERE userId=?').get(userId);
  if (!row) {
    db.prepare(
      'INSERT INTO points (userId,points,voiceLastJoin,createdAt) VALUES (?,?,?,?)'
    ).run(userId, 0, now, Date.now());
  } else if (!row.voiceLastJoin) {
    db.prepare('UPDATE points SET voiceLastJoin=? WHERE userId=?').run(now, userId);
  }
};

const _awardVoiceSession = (session, now = Date.now()) => {
  const hour = 60 * 60 * 1000;
  const lastAwardAt = Number(session.lastAwardAt || session.joinedAt);
  const elapsed = now - lastAwardAt;
  const wholeHours = Math.floor(elapsed / hour);
  if (wholeHours <= 0) return 0;

  const amount = wholeHours;
  const nextAwardAt = lastAwardAt + wholeHours * hour;

  const tx = db.transaction(() => {
    const row = db.prepare('SELECT * FROM points WHERE userId=?').get(session.userId);
    if (!row) {
      db.prepare(
        'INSERT INTO points (userId,points,voiceLastJoin,createdAt) VALUES (?,?,?,?)'
      ).run(session.userId, amount, nextAwardAt, Date.now());
    } else {
      db.prepare(
        'UPDATE points SET points = points + ?, voiceLastJoin=? WHERE userId=?'
      ).run(amount, nextAwardAt, session.userId);
    }

    const balance = Number(
      db.prepare('SELECT points FROM points WHERE userId=?').get(session.userId)?.points || 0
    );

    db.prepare(`
      INSERT INTO points_transactions
        (userId,type,amount,balanceAfter,reason,relatedRequestId,performedBy,createdAt)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      session.userId,
      'voice',
      amount,
      balance,
      'Голосовой онлайн: полный час',
      null,
      null,
      now
    );

    db.prepare(`
      UPDATE voice_sessions
      SET lastAwardAt=?
      WHERE userId=? AND guildId=?
    `).run(nextAwardAt, session.userId, session.guildId);
  });

  tx();
  try { unlockEligibleAchievements(session.userId); } catch {}
  return amount;
};

const processVoicePoints = (now = Date.now(), eligibleUserKeys = null) => {
  const sessions = db.prepare('SELECT * FROM voice_sessions').all();
  const results = [];

  for (const session of sessions) {
    try {
      if (eligibleUserKeys instanceof Set &&
          !eligibleUserKeys.has(sessionKey(session.userId, session.guildId))) {
        stopVoiceSession(session.userId, session.guildId);
        continue;
      }

      const awarded = _awardVoiceSession(session, now);
      if (awarded > 0) {
        results.push({
          userId: session.userId,
          guildId: session.guildId,
          amount: awarded,
          awardedAt: now,
        });
      }
    } catch (e) {
      console.error(
        `Voice points award failed for ${session.guildId}/${session.userId}: ${e.message}`
      );
    }
  }

  return results;
};

const stopVoiceSession = (userId, guildId = null) => {
  if (guildId) {
    db.prepare(
      'DELETE FROM voice_sessions WHERE userId=? AND guildId=?'
    ).run(userId, guildId);
  } else {
    db.prepare('DELETE FROM voice_sessions WHERE userId=?').run(userId);
  }
  db.prepare('UPDATE points SET voiceLastJoin=NULL WHERE userId=?').run(userId);
};

const voiceLeave = (userId, guildId = null) => {
  const session = guildId
    ? db.prepare(
        'SELECT * FROM voice_sessions WHERE userId=? AND guildId=?'
      ).get(userId, guildId)
    : db.prepare(
        'SELECT * FROM voice_sessions WHERE userId=? ORDER BY lastAwardAt ASC LIMIT 1'
      ).get(userId);

  if (!session) {
    db.prepare('UPDATE points SET voiceLastJoin=NULL WHERE userId=?').run(userId);
    return 0;
  }

  const awarded = _awardVoiceSession(session, Date.now());
  db.prepare(
    'DELETE FROM voice_sessions WHERE userId=? AND guildId=?'
  ).run(userId, session.guildId);

  const remaining = db.prepare(
    'SELECT 1 FROM voice_sessions WHERE userId=? LIMIT 1'
  ).get(userId);
  if (!remaining) {
    db.prepare('UPDATE points SET voiceLastJoin=NULL WHERE userId=?').run(userId);
  }

  return awarded;
};

const syncVoiceSessions = (
  activeVoiceMembers = [],
  eligibleUserKeys = null,
  activeNonAfkUserKeys = null
) => {
  const eligible = eligibleUserKeys instanceof Set ? eligibleUserKeys : null;
  const activeNonAfk = activeNonAfkUserKeys instanceof Set ? activeNonAfkUserKeys : null;
  const seen = new Set();

  for (const item of activeVoiceMembers) {
    if (!item?.userId || !item?.guildId) continue;
    const key = sessionKey(item.userId, item.guildId);
    if (eligible && !eligible.has(key)) continue;

    seen.add(key);
    voiceJoin(item.userId, item.guildId, item.channelId || null);
  }

  const sessions = db.prepare('SELECT * FROM voice_sessions').all();
  for (const session of sessions) {
    const key = sessionKey(session.userId, session.guildId);
    if (seen.has(key)) continue;

    if (activeNonAfk && activeNonAfk.has(key)) {
      stopVoiceSession(session.userId, session.guildId);
    } else {
      voiceLeave(session.userId, session.guildId);
    }
  }
};

const restoreVoiceSessions = (
  activeVoiceMembers = [],
  eligibleUserKeys = null,
  activeNonAfkUserKeys = null
) => {
  const eligible = eligibleUserKeys instanceof Set ? eligibleUserKeys : null;
  const activeNonAfk = activeNonAfkUserKeys instanceof Set ? activeNonAfkUserKeys : null;
  const seen = new Set();

  for (const item of activeVoiceMembers) {
    if (!item?.userId || !item?.guildId) continue;
    const key = sessionKey(item.userId, item.guildId);
    if (eligible && !eligible.has(key)) continue;

    seen.add(key);
    voiceJoin(item.userId, item.guildId, item.channelId || null);
  }

  const sessions = db.prepare('SELECT * FROM voice_sessions').all();
  for (const session of sessions) {
    const key = sessionKey(session.userId, session.guildId);
    if (seen.has(key)) continue;

    if (activeNonAfk && activeNonAfk.has(key) && eligible && !eligible.has(key)) {
      stopVoiceSession(session.userId, session.guildId);
    } else if (eligible && !eligible.has(key)) {
      stopVoiceSession(session.userId, session.guildId);
    } else {
      voiceLeave(session.userId, session.guildId);
    }
  }
};

const addPoints = (userId, amount, meta = {}) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return false;

  const tx = db.transaction(() => {
    const row = db.prepare('SELECT * FROM points WHERE userId=?').get(userId);
    if (!row) {
      db.prepare('INSERT INTO points (userId,points,voiceLastJoin,createdAt) VALUES (?,?,?,?)')
        .run(userId, numericAmount, null, Date.now());
    } else {
      db.prepare('UPDATE points SET points = points + ? WHERE userId = ?')
        .run(numericAmount, userId);
    }

    const balance = Number(db.prepare('SELECT points FROM points WHERE userId=?').get(userId)?.points || 0);
    db.prepare(`
      INSERT INTO points_transactions
        (userId,type,amount,balanceAfter,reason,relatedRequestId,performedBy,createdAt)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      userId,
      meta.type || 'manual',
      numericAmount,
      balance,
      meta.reason || null,
      meta.relatedRequestId || null,
      meta.performedBy || null,
      Date.now()
    );
  });

  tx();
  try { unlockEligibleAchievements(userId); } catch {}
  return true;
};

const bulkAddPoints = (userIds = [], amount = 0, meta = {}) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return 0;
  const ids = [...new Set(userIds.filter((id) => /^\d+$/.test(String(id))))];
  const tx = db.transaction(() => {
    let changed = 0;
    for (const uid of ids) {
      const row = db.prepare('SELECT points FROM points WHERE userId=?').get(uid);
      const before = Number(row?.points || 0);
      const after = before + numericAmount;
      if (!row) db.prepare('INSERT INTO points (userId,points,voiceLastJoin,createdAt) VALUES (?,?,?,?)').run(uid, numericAmount, null, Date.now());
      else db.prepare('UPDATE points SET points = points + ? WHERE userId = ?').run(numericAmount, uid);
      db.prepare(`INSERT INTO points_transactions (userId,type,amount,balanceAfter,reason,relatedRequestId,performedBy,createdAt) VALUES (?,?,?,?,?,?,?,?)`).run(uid, meta.type || 'bulk_add', numericAmount, after, meta.reason || null, meta.relatedRequestId || null, meta.performedBy || null, Date.now());
      changed++;
    }
    return changed;
  });
  return tx();
};

const bulkRemovePoints = (userIds = [], amount = 0, meta = {}) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return 0;
  const ids = [...new Set(userIds.filter((id) => /^\d+$/.test(String(id))))];
  const tx = db.transaction(() => {
    let changed = 0;
    for (const uid of ids) {
      const row = db.prepare('SELECT points FROM points WHERE userId=?').get(uid);
      if (!row) continue;
      const before = Number(row.points || 0);
      const actual = Math.min(before, numericAmount);
      if (actual <= 0) continue;
      const after = before - actual;
      db.prepare('UPDATE points SET points = ? WHERE userId = ?').run(after, uid);
      db.prepare(`INSERT INTO points_transactions (userId,type,amount,balanceAfter,reason,relatedRequestId,performedBy,createdAt) VALUES (?,?,?,?,?,?,?,?)`).run(uid, meta.type || 'bulk_remove', -actual, after, meta.reason || null, meta.relatedRequestId || null, meta.performedBy || null, Date.now());
      changed++;
    }
    return changed;
  });
  return tx();
};

const getPointsTransactions = (userId, limit = 50) =>
  db.prepare('SELECT * FROM points_transactions WHERE userId=? ORDER BY createdAt DESC LIMIT ?').all(userId, limit);

const getSetting = (key, defaultValue = null) => {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : defaultValue;
};

const setSetting = (key, value) => {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, String(value));
};

const isApplicationsOpen = () => getSetting('applications_open', '1') === '1';
const setApplicationsOpen = (open) => setSetting('applications_open', open ? '1' : '0');

const isModsOpen = () => getSetting('mods_open', '1') === '1';
const setModsOpen = (open) => setSetting('mods_open', open ? '1' : '0');

const reconcileApplicationsSchema = () => {
  try {
    const actualColumns = db.prepare('PRAGMA table_info(applications)').all();
    const actualNames = new Set(actualColumns.map((c) => c.name));
    for (const col of APPLICATIONS_SCHEMA) {
      if (!actualNames.has(col.name)) {
        db.exec(`ALTER TABLE applications ADD COLUMN ${col.name} ${col.def}`);
        console.log(`✓ Added column applications.${col.name}`);
      }
    }
  } catch (e) {
    console.log(`⚠ Failed to reconcile applications schema: ${e.message}`);
  }
};

const initDatabase = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS blacklist (
      userId TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      reason TEXT DEFAULT 'Не указана',
      addedBy TEXT NOT NULL,
      addedAt INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS cooldowns (
      userId TEXT PRIMARY KEY,
      expiresAt INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS capts (
      id TEXT PRIMARY KEY,
      channelId TEXT NOT NULL,
      time TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      main TEXT,
      subs TEXT,
      messageId TEXT,
      reminderSent INTEGER DEFAULT 0,
      reminderDate TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS mcls (
      id TEXT PRIMARY KEY,
      channelId TEXT NOT NULL,
      time TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      main TEXT,
      subs TEXT,
      messageId TEXT,
      reminderSent INTEGER DEFAULT 0,
      reminderDate TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS afk_users (
      userId TEXT NOT NULL,
      guildId TEXT NOT NULL,
      afkAt INTEGER NOT NULL,
      reason TEXT,
      lastActivityAt INTEGER,
      PRIMARY KEY (userId, guildId)
    )
  `);

  migrateAfkUsersSchema();

  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      userId TEXT PRIMARY KEY,
      userTag TEXT NOT NULL DEFAULT '',
      age TEXT,
      level TEXT,
      nickname TEXT,
      reason TEXT,
      onlineAndExp TEXT,
      messageId TEXT,
      createdAt INTEGER NOT NULL DEFAULT 0,
      answers TEXT,
      status TEXT DEFAULT 'pending',
      submittedAt INTEGER
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS application_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      userTag TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      performedBy TEXT,
      performedAt INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tier_tickets (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      channelId TEXT NOT NULL,
      messageId TEXT,
      status TEXT DEFAULT 'open',
      reviewerId TEXT,
      createdAt INTEGER NOT NULL,
      closedAt INTEGER
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tier_applications (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      answers TEXT,
      messageId TEXT,
      reviewerId TEXT,
      createdAt INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS points (
      userId TEXT PRIMARY KEY,
      points REAL DEFAULT 0,
      voiceLastJoin INTEGER,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_sessions (
      userId TEXT PRIMARY KEY,
      guildId TEXT NOT NULL,
      channelId TEXT,
      joinedAt INTEGER NOT NULL,
      lastAwardAt INTEGER NOT NULL
    )
  `);

  migrateVoiceSessionsSchema();

  db.exec(`
    CREATE TABLE IF NOT EXISTS points_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balanceAfter REAL NOT NULL,
      reason TEXT,
      relatedRequestId TEXT,
      performedBy TEXT,
      createdAt INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS points_requests (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      reasonType TEXT,
      name TEXT,
      proof TEXT,
      amount REAL,
      status TEXT DEFAULT 'pending',
      messageId TEXT,
      reviewerId TEXT,
      createdAt INTEGER NOT NULL,
      handledAt INTEGER
    )
  `);

  ensureColumn('afk_users', 'lastActivityAt', 'INTEGER');
  db.prepare('UPDATE afk_users SET lastActivityAt = afkAt WHERE lastActivityAt IS NULL').run();
  ensureColumn('points_requests', 'details', 'TEXT');
  ensureColumn('capts', 'reminderSent', 'INTEGER DEFAULT 0');
  ensureColumn('mcls', 'reminderSent', 'INTEGER DEFAULT 0');
  ensureColumn('capts', 'reminderDate', 'TEXT');
  ensureColumn('mcls', 'reminderDate', 'TEXT');

  reconcileApplicationsSchema();

  db.exec(`
    CREATE TABLE IF NOT EXISTS item_takes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      userTag TEXT NOT NULL,
      amount INTEGER NOT NULL,
      location TEXT,
      note TEXT,
      createdAt INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouse_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      itemId TEXT NOT NULL UNIQUE,
      itemName TEXT NOT NULL,
      emoji TEXT,
      stock INTEGER NOT NULL DEFAULT 0,
      messageId TEXT
    )
  `);

  ensureColumn('warehouse_items', 'ownerId', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouse_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouse_taken (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      itemId TEXT NOT NULL,
      takenAt INTEGER NOT NULL,
      returnedAt INTEGER
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS achievements (
      userId TEXT NOT NULL,
      achievementId TEXT NOT NULL,
      unlockedAt INTEGER NOT NULL,
      PRIMARY KEY (userId, achievementId)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fileName TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      sizeBytes INTEGER NOT NULL
    )
  `);

  console.log('✓ Database initialized');
};

initDatabase();

const saveItemTake = (data) => {
  db.prepare(`INSERT INTO item_takes (userId,userTag,amount,location,note,createdAt) VALUES (?,?,?,?,?,?)`)
    .run(data.userId, data.userTag, data.amount, data.location, data.note, data.createdAt);
};

const initWarehouseItem = (itemId, itemName, emoji, stock = 0) => {
  db.prepare(`INSERT OR IGNORE INTO warehouse_items (itemId,itemName,emoji,stock) VALUES (?,?,?,?)`).run(itemId, itemName, emoji, stock);
};

const getWarehouseItem = (itemId) => {
  return db.prepare('SELECT * FROM warehouse_items WHERE itemId=?').get(itemId);
};

const getAllWarehouseItems = () => {
  return db.prepare('SELECT * FROM warehouse_items').all();
};

const setWarehouseMessageId = (messageId) => {
  db.prepare(`INSERT OR REPLACE INTO warehouse_settings (key, value) VALUES ('panel_message_id', ?)`).run(messageId);
};

const getWarehouseMessageId = () => {
  const row = db.prepare('SELECT value FROM warehouse_settings WHERE key=?').get('panel_message_id');
  return row ? row.value : null;
};

const takeWarehouseItem = (userId, itemId) => {
  db.prepare(`INSERT INTO warehouse_taken (userId,itemId,takenAt) VALUES (?,?,?)`).run(userId, itemId, Date.now());
};

const returnWarehouseItem = (userId, itemId) => {
  db.prepare(`UPDATE warehouse_taken SET returnedAt=? WHERE userId=? AND itemId=? AND returnedAt IS NULL`).run(Date.now(), userId, itemId);
};

const takeWarehouseItemAtomic = (userId, itemId) => {
  const tx = db.transaction(() => {
    const item = db.prepare('SELECT * FROM warehouse_items WHERE itemId=?').get(itemId);
    if (!item) return { ok: false, reason: 'not_found' };

    const alreadyTaken = db.prepare(
      'SELECT 1 FROM warehouse_taken WHERE userId=? AND itemId=? AND returnedAt IS NULL'
    ).get(userId, itemId);
    if (alreadyTaken) return { ok: false, reason: 'already_taken' };

    const stock = db.prepare(
      'UPDATE warehouse_items SET stock = stock - 1 WHERE itemId=? AND stock > 0'
    ).run(itemId);

    if (!stock.changes) return { ok: false, reason: 'out_of_stock' };

    db.prepare(
      'INSERT INTO warehouse_taken (userId,itemId,takenAt) VALUES (?,?,?)'
    ).run(userId, itemId, Date.now());

    try { unlockEligibleAchievements(userId); } catch {}
    return { ok: true, item };
  });

  return tx();
};

const returnWarehouseItemAtomic = (userId, itemId) => {
  const tx = db.transaction(() => {
    const item = db.prepare('SELECT * FROM warehouse_items WHERE itemId=?').get(itemId);
    if (!item) return { ok: false, reason: 'not_found' };

    const taken = db.prepare(
      'SELECT id FROM warehouse_taken WHERE userId=? AND itemId=? AND returnedAt IS NULL ORDER BY takenAt DESC LIMIT 1'
    ).get(userId, itemId);
    if (!taken) return { ok: false, reason: 'not_taken' };

    db.prepare('UPDATE warehouse_items SET stock = stock + 1 WHERE itemId=?').run(itemId);
    db.prepare(
      'UPDATE warehouse_taken SET returnedAt=? WHERE id=? AND returnedAt IS NULL'
    ).run(Date.now(), taken.id);

    return { ok: true, item };
  });

  return tx();
};

const isItemTakenByUser = (userId, itemId) => {
  const row = db.prepare('SELECT 1 FROM warehouse_taken WHERE userId=? AND itemId=? AND returnedAt IS NULL').get(userId, itemId);
  return row !== undefined;
};

const getUserTakenItems = (userId) => {
  return db.prepare('SELECT * FROM warehouse_taken WHERE userId=? AND returnedAt IS NULL').all(userId);
};

const getAllWarehouseTakenItems = () => {
  return db.prepare('SELECT * FROM warehouse_taken WHERE returnedAt IS NULL ORDER BY takenAt DESC').all();
};

const logApplicationHistory = (userId, userTag, action, details, performedBy) => {
  db.prepare(`INSERT INTO application_history (userId, userTag, action, details, performedBy, performedAt) VALUES (?,?,?,?,?,?)`).run(userId, userTag, action, details, performedBy, Date.now());
};

const getApplicationHistory = (userId, limit = 50) => {
  return db.prepare('SELECT * FROM application_history WHERE userId=? ORDER BY performedAt DESC LIMIT ?').all(userId, limit);
};

const getAllApplicationHistory = (limit = 100) => {
  return db.prepare('SELECT * FROM application_history ORDER BY performedAt DESC LIMIT ?').all(limit);
};

const getUserPointSummary = (userId) => {
  const points = getPoints(userId);
  const voiceRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS hours
    FROM points_transactions
    WHERE userId=? AND type='voice' AND amount > 0
  `).get(userId);
  const earned = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total
    FROM points_transactions WHERE userId=?
  `).get(userId)?.total || 0;
  const spent = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) AS total
    FROM points_transactions WHERE userId=?
  `).get(userId)?.total || 0;
  const first = db.prepare(`
    SELECT MIN(createdAt) AS firstAt FROM points_transactions WHERE userId=? AND type='voice'
  `).get(userId)?.firstAt || null;
  return {
    points: Number(points || 0),
    voiceHours: Number(voiceRow?.hours || 0),
    earned: Number(earned || 0),
    spent: Number(spent || 0),
    firstVoiceAt: first,
  };
};

const getUserVoiceActivityDays = (userId) => {
  const rows = db.prepare(`
    SELECT DISTINCT strftime('%Y-%m-%d', createdAt / 1000, 'unixepoch', 'localtime') AS day
    FROM points_transactions
    WHERE userId=? AND type='voice' AND amount > 0
    ORDER BY day DESC
  `).all(userId);
  return rows.map((r) => r.day).filter(Boolean);
};

const unlockEligibleAchievements = (userId) => {
  const stats = getUserPointSummary(userId);
  const days = getUserVoiceActivityDays(userId);
  const rank = getUserRank(userId);
  const hasItem = getUserTakenItems(userId).length > 0;
  const checks = {
    first_hour: stats.voiceHours >= 1,
    ten_hours: stats.voiceHours >= 10,
    fifty_hours: stats.voiceHours >= 50,
    hundred_hours: stats.voiceHours >= 100,
    hundred_points: stats.points >= 100,
    seven_days: days.length >= 7,
    thirty_days: days.length >= 30,
    top_one: rank === 1 && stats.points > 0,
    first_item: hasItem,
  };
  for (const [id, ok] of Object.entries(checks)) if (ok) unlockAchievement(userId, id);
};

const getUserRank = (userId) => {
  const row = db.prepare(`
    SELECT 1 + COUNT(*) AS rank
    FROM points p
    WHERE p.points > (SELECT COALESCE(points,0) FROM points WHERE userId=?)
      AND p.points > 0
  `).get(userId);
  return Number(row?.rank || 1);
};

const getAchievementRows = (userId) =>
  db.prepare('SELECT achievementId, unlockedAt FROM achievements WHERE userId=? ORDER BY unlockedAt ASC').all(userId);

const unlockAchievement = (userId, achievementId) => {
  const result = db.prepare(
    'INSERT OR IGNORE INTO achievements (userId, achievementId, unlockedAt) VALUES (?,?,?)'
  ).run(userId, achievementId, Date.now());
  return result.changes > 0;
};

const resetEntireDatabase = () => {
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);
  const tx = db.transaction(() => {
    for (const table of tables) {
      db.prepare(`DELETE FROM "${table.replace(/"/g, '""')}"`).run();
    }
    try { db.prepare('DELETE FROM sqlite_sequence').run(); } catch {}
  });
  tx();
  return tables;
};

const getDatabaseHealth = () => {
  const integrity = db.prepare('PRAGMA integrity_check').get();
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((r) => r.name);
  const counts = {};
  for (const table of tables) {
    try { counts[table] = Number(db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c); } catch { counts[table] = -1; }
  }
  return {
    ok: integrity?.integrity_check === 'ok',
    integrity: integrity?.integrity_check || 'unknown',
    journalMode: db.pragma('journal_mode', { simple: true }),
    tables,
    counts,
  };
};

const createBackupRecord = (fileName, sizeBytes) => {
  db.prepare('INSERT INTO daily_backups (fileName,createdAt,sizeBytes) VALUES (?,?,?)')
    .run(fileName, Date.now(), Number(sizeBytes || 0));
};

const getRecentBackups = (limit = 20) =>
  db.prepare('SELECT * FROM daily_backups ORDER BY createdAt DESC LIMIT ?').all(limit);

const pruneBackupRecords = (keep = 14) => {
  db.prepare(`DELETE FROM daily_backups WHERE id NOT IN (SELECT id FROM daily_backups ORDER BY createdAt DESC LIMIT ?)`).run(keep);
};




const addWarehouseOwner = (userId, itemId, count = 1) => {
  const n = Number(count);
  if (!Number.isInteger(n) || n <= 0) return { ok: false, reason: 'invalid_count' };

  const item = db.prepare('SELECT * FROM warehouse_items WHERE itemId=?').get(itemId);
  if (!item) return { ok: false, reason: 'not_found' };

  db.prepare('UPDATE warehouse_items SET ownerId=? WHERE itemId=?')
    .run(userId, itemId);

  return { ok: true, item };
};

const getWarehouseOwners = () => {
  return db.prepare(`
    SELECT wi.ownerId AS userId, wi.itemName, wi.emoji, wi.stock AS count
    FROM warehouse_items wi
    WHERE wi.ownerId IS NOT NULL AND wi.ownerId != ''
    ORDER BY wi.itemName
  `).all();
};


module.exports = {
  db,
  addToBlacklist, removeFromBlacklist, getBlacklist,
  setCooldown, getCooldown, removeCooldown, cleanExpiredCooldowns,
  saveCaught, getCaughtList, getAllCaughtLists, updateCaughtList, deleteCaughtFromDB, deleteCaughtByChannel,
  saveMCL, getMCLList, getAllMCLLists, updateMCLList, deleteMCLFromDB, deleteMCLByChannel,
  clearAllRosters,
  setAFK, removeAFK, getAFK, getAllAFK,
  saveApplication, getApplication, setApplicationMessageId, deleteApplication,
  createTierTicket, deleteTierApplicationByUser, deleteTierTicketByUser, getOpenTierTicketByUser, getTierTicketByChannel, deleteTierTicketByChannel, closeTierTicket,
  createPointsRequest, getPointsRequest, updatePointsRequest, setPointsRequestStatus, claimPointsRequest, recoverProcessingPointsRequests,
  addPoints, removePoints, getPoints, getTopPoints,
  voiceJoin, voiceLeave, processVoicePoints, restoreVoiceSessions, syncVoiceSessions,
  bulkAddPoints, bulkRemovePoints, resetAllPoints,
  stopVoiceSession,
  getPointsTransactions,
  getSetting, setSetting,
  isApplicationsOpen, setApplicationsOpen,
  isModsOpen, setModsOpen,
  saveItemTake,
  initWarehouseItem, getWarehouseItem, getAllWarehouseItems, setWarehouseMessageId, getWarehouseMessageId,
  takeWarehouseItem, returnWarehouseItem, takeWarehouseItemAtomic, returnWarehouseItemAtomic, isItemTakenByUser, getUserTakenItems, getAllWarehouseTakenItems,
  logApplicationHistory, getApplicationHistory, getAllApplicationHistory,
  getUserPointSummary, getUserVoiceActivityDays, getUserRank, getAchievementRows,
  unlockAchievement, getDatabaseHealth, resetEntireDatabase, createBackupRecord, getRecentBackups, pruneBackupRecords,
  addWarehouseOwner, getWarehouseOwners,
};