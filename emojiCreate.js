const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.GuildEmojiCreate,async execute(emoji){await audit.log('emoji','Эмодзи создано',{guildId:emoji.guild.id,emojiId:emoji.id,name:emoji.name,animated:emoji.animated});}};
