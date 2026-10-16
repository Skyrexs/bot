const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports = { name: Events.ChannelUpdate, async execute(oldChannel, newChannel) {
  if (!newChannel.guild) return;
  await audit.log('channel', 'Канал изменён', {
    guildId: newChannel.guild.id, channelId: newChannel.id,
    oldName: oldChannel.name, newName: newChannel.name,
    oldParentId: oldChannel.parentId, newParentId: newChannel.parentId,
    oldType: oldChannel.type, newType: newChannel.type,
  });
}};
