const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.GuildEmojiDelete,async execute(emoji){await audit.log('emoji','Эмодзи удалено',{guildId:emoji.guild.id,emojiId:emoji.id,name:emoji.name});}};
