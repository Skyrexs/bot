const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.GuildScheduledEventCreate,async execute(event){await audit.log('scheduled_event','Запланированное событие создано',{guildId:event.guildId,eventId:event.id,name:event.name,status:event.status,scheduledStartAt:event.scheduledStartAt});}};
