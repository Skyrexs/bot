const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.GuildStickerDelete,async execute(sticker){await audit.log('sticker','Стикер удалён',{guildId:sticker.guild.id,stickerId:sticker.id,name:sticker.name});}};
