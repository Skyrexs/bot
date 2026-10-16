const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.GuildScheduledEventUserAdd,async execute(event,user){await audit.log('scheduled_event','Пользователь записался на событие',{guildId:event.guildId,eventId:event.id,userId:user.id});}};
