const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports = { name: Events.ChannelCreate, async execute(channel) {
  if (!channel.guild) return;
  await audit.log('channel', 'Канал создан', { guildId: channel.guild.id, channelId: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId });
}};
