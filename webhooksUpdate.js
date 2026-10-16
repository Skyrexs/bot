const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.WebhooksUpdate,async execute(channel){await audit.log('webhook','Вебхуки канала изменены',{guildId:channel.guildId,channelId:channel.id});}};
