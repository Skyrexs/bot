const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.GuildScheduledEventUpdate,async execute(oldEvent,newEvent){await audit.log('scheduled_event','Запланированное событие изменено',{guildId:newEvent.guildId,eventId:newEvent.id,oldName:oldEvent.name,newName:newEvent.name,oldStatus:oldEvent.status,newStatus:newEvent.status});}};
