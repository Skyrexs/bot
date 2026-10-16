const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.GuildStickerUpdate,async execute(oldSticker,newSticker){await audit.log('sticker','Стикер изменён',{guildId:newSticker.guild.id,stickerId:newSticker.id,oldName:oldSticker.name,newName:newSticker.name});}};
