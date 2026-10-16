const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports = { name: Events.MessageReactionRemove, async execute(reaction, user) { if (user?.bot) return; await audit.log('reaction', 'Реакция удалена', { guildId: reaction.message.guildId, channelId: reaction.message.channelId, messageId: reaction.message.id, userId: user.id, emoji: reaction.emoji?.name || reaction.emoji?.id }); } };
