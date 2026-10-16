const { Events } = require('discord.js');
const db = require('../database');
const audit = require('../utils').audit;
const logger = require('../logger');

module.exports = {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!channel.guild) return;
    try {
      const channelId = channel.id;
      const adminHandler = require('../handlers/admin');
      const capt = db.getAllCaughtLists().find((x) => x.channelId === channelId);
      const mcl = db.getAllMCLLists().find((x) => x.channelId === channelId);
      if (capt?.id) adminHandler.clearRosterReminder(capt.id);
      if (mcl?.id) adminHandler.clearRosterReminder(mcl.id);
      const tierTicket = db.getTierTicketByChannel(channelId);
      const captDeleted = db.deleteCaughtByChannel(channelId).changes || 0;
      const mclDeleted = db.deleteMCLByChannel(channelId).changes || 0;
      const tierDeleted = db.deleteTierTicketByChannel(channelId);
      if (tierTicket?.userId) db.deleteTierApplicationByUser(tierTicket.userId);
      await audit.log('channel', 'Канал удалён и связанные записи очищены', {
        guildId: channel.guild.id, channelId, name: channel.name, type: channel.type, parentId: channel.parentId,
        captDeleted, mclDeleted, tierDeleted, captId: capt?.id || null, mclId: mcl?.id || null, tierTicketId: tierTicket?.id || null,
      });
    } catch (e) {
      logger.error('channelDelete cleanup failed', { error: e.message, stack: e.stack, channelId: channel.id });
      await audit.log('error', 'Channel deletion cleanup failed', { channelId: channel.id, error: e.message }).catch(()=>{});
    }
  },
};
