// events/messageReactionAdd.js
const { Events } = require('discord.js');
const audit = require('../utils').audit;
const db = require('../database');
const logger = require('../logger');

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    try {
      if (user?.bot) return;

      const emoji = reaction.emoji?.name || reaction.emoji?.id;
      const message = reaction.message;

      // CAPT/MCL admin moderation: if reaction in a CAPT/MCL thread channel and reactor has CAPT_ADMIN_ROLE_ID
      const captAdminRole = process.env.CAPT_ADMIN_ROLE_ID || require('../config').CAPT_ADMIN_ROLE_ID;
      const member = await message.guild?.members.fetch(user.id).catch(()=>null);
      if (captAdminRole && member && member.roles.cache.has(captAdminRole)) {
        // Check if the message corresponds to a signup message (we store signup messages as capts/mcls messageId)
        const capt = db.db.prepare('SELECT * FROM capts WHERE messageId = ?').get(message.id) || db.db.prepare('SELECT * FROM mcls WHERE messageId = ?').get(message.id);
        if (capt) {
          // Reaction by admin on a user's message in thread: find target user (message.author)
          // If they reacted to a user message (not the panel), move that user into main/sub
          const targetUserId = reaction.message.author?.id;
          if (!targetUserId) return;
          if (emoji === '✅' || emoji === '✔️') {
            // move to main
            const list = db.getCaughtList(capt.id) || db.getMCLList(capt.id);
            if (!list) return;
            const main = Array.isArray(list.main) ? list.main : [];
            const subs = Array.isArray(list.subs) ? list.subs : [];
            if (!main.includes(targetUserId)) {
              // remove from subs if present
              const ns = subs.filter(id => id !== targetUserId);
              main.push(targetUserId);
              const updateFn = String(capt.id).startsWith('capt_') ? db.updateCaughtList : db.updateMCLList;
              updateFn(capt.id, { main: JSON.stringify(main), subs: JSON.stringify(ns) });
              audit.log('captmcl', 'Admin moved user to main', { listId: capt.id, target: targetUserId, by: user.id });
            }
          } else if (emoji === '🔁' || emoji === '➕') {
            // move to subs
            const list = db.getCaughtList(capt.id) || db.getMCLList(capt.id);
            if (!list) return;
            const main = Array.isArray(list.main) ? list.main : [];
            const subs = Array.isArray(list.subs) ? list.subs : [];
            if (!subs.includes(targetUserId)) {
              const nm = main.filter(id => id !== targetUserId);
              subs.push(targetUserId);
              const updateFn = String(capt.id).startsWith('capt_') ? db.updateCaughtList : db.updateMCLList;
              updateFn(capt.id, { main: JSON.stringify(nm), subs: JSON.stringify(subs) });
              audit.log('captmcl', 'Admin moved user to subs', { listId: capt.id, target: targetUserId, by: user.id });
            }
          }
        }
      }

      // Giveaway - if reaction on giveaway message, treat as participation
      if (reaction.message?.channelId) {
        const g = db.db.prepare('SELECT * FROM giveaways WHERE channelId=? AND messageId=?').get(reaction.message.channelId, reaction.message.id);
        if (g && g.status === 'active') {
          // store participant
          db.db.prepare('INSERT OR IGNORE INTO giveaways_participants (giveawayId,userId,joinedAt) VALUES (?,?,?)').run(g.id, user.id, Date.now());
          audit.log('giveaway','participant added', { giveawayId: g.id, userId: user.id });
        }
      }

      // default audit
      await audit.log('reaction', 'Реакция добавлена', { guildId: reaction.message.guildId, channelId: reaction.message.channelId, messageId: reaction.message.id, userId: user.id, emoji });
    } catch (e) {
      logger.error('messageReactionAdd handler failed', { error: e.message, stack: e.stack });
    }
  }
};