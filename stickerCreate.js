const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.GuildStickerCreate,async execute(sticker){await audit.log('sticker','Стикер создан',{guildId:sticker.guild.id,stickerId:sticker.id,name:sticker.name});}};
