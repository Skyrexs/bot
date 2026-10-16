const { Events } = require('discord.js');
const logger = require('../logger');
const utils = require('../utils');
const audit = utils.audit;
const config = require('../config');
const db = require('../database');

async function removeMemberFromRosters(member) {
  const guild = member.guild;
  const userId = member.id;
  let changed = 0;

  const updateListMessage = async (list) => {
    if (!list?.messageId || !list.channelId) return;
    const channel = await guild.channels.fetch(list.channelId).catch(() => null);
    if (!channel || channel.guildId !== guild.id) return;
    const message = await channel.messages.fetch(list.messageId).catch(() => null);
    if (!message) return;
    const { container } = await require('../utils/captMclPanel').buildCaptMclPanel(list, guild);
    await message.edit({ components: [container] }).catch(() => {});
  };

  if (db.getAFK(userId, guild.id)) {
    db.removeAFK(userId, guild.id);
    await utils.logAFKEvent(userId, guild.id, 'returned').catch(() => {});
    await utils.updateAFKPanelMessage(member.client, guild.id).catch(() => {});
    changed += 1;
  }

  for (const list of [...db.getAllCaughtLists(), ...db.getAllMCLLists()]) {
    const channel = await guild.channels.fetch(list.channelId).catch(() => null);
    if (!channel || channel.guildId !== guild.id) continue;

    const main = Array.isArray(list.main) ? list.main : [];
    const subs = Array.isArray(list.subs) ? list.subs : [];
    if (!main.includes(userId) && !subs.includes(userId)) continue;

    const nextMain = main.filter((id) => id !== userId);
    const nextSubs = subs.filter((id) => id !== userId);

    if (String(list.id).startsWith('capt_')) {
      db.updateCaughtList(list.id, { main: nextMain, subs: nextSubs });
    } else {
      db.updateMCLList(list.id, { main: nextMain, subs: nextSubs });
    }

    changed += 1;
    const updated = String(list.id).startsWith('capt_')
      ? db.getCaughtList(list.id)
      : db.getMCLList(list.id);
    await updateListMessage(updated);
  }

  return changed;
}

module.exports = {
  name: Events.GuildMemberUpdate,

  async execute(oldMember, newMember) {
    try {
      const oldRoles = new Set(oldMember.roles.cache.keys());
      const newRoles = new Set(newMember.roles.cache.keys());

      const addedRoles = [...newRoles].filter((id) => !oldRoles.has(id));
      const removedRoles = [...oldRoles].filter((id) => !newRoles.has(id));
      const nicknameChanged = oldMember.nickname !== newMember.nickname;

      const benzoRoleId = config.BENZO_ROLE_ID;
      const lostBenzo =
        Boolean(benzoRoleId) &&
        oldMember.roles.cache.has(benzoRoleId) &&
        !newMember.roles.cache.has(benzoRoleId);

      const gainedBenzo =
        Boolean(benzoRoleId) &&
        !oldMember.roles.cache.has(benzoRoleId) &&
        newMember.roles.cache.has(benzoRoleId);

      if (lostBenzo) {
        const awarded = db.voiceLeave(newMember.id, newMember.guild.id);
        const removed = await removeMemberFromRosters(newMember);

        audit.log('member', 'BENZO снята: пользователь удалён из AFK/CAPT/MCL', {
          guildId: newMember.guild.id,
          userId: newMember.id,
          awardedVoicePoints: awarded,
          removedFromRosters: removed,
        });
      } else if (gainedBenzo && newMember.voice?.channelId) {
        if (
          !config.AFK_VOICE_CHANNEL_ID ||
          newMember.voice.channelId !== config.AFK_VOICE_CHANNEL_ID
        ) {
          db.voiceJoin(
            newMember.id,
            newMember.guild.id,
            newMember.voice.channelId
          );
        }
      }

      if (addedRoles.length || removedRoles.length || nicknameChanged) {
        await audit.log('member', 'Изменения участника', {
          guildId: newMember.guild.id,
          userId: newMember.id,
          tag: newMember.user.tag,
          nickname: {
            old: oldMember.nickname,
            new: newMember.nickname,
          },
          addedRoles,
          removedRoles,
        });
      }
    } catch (e) {
      logger.error('Ошибка guildMemberUpdate', {
        error: e.message,
        stack: e.stack,
      });
    }
  },
  removeMemberFromRosters,
};
