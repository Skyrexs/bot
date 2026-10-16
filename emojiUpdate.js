const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.GuildEmojiUpdate,async execute(oldEmoji,newEmoji){await audit.log('emoji','Эмодзи изменено',{guildId:newEmoji.guild.id,emojiId:newEmoji.id,oldName:oldEmoji.name,newName:newEmoji.name});}};
