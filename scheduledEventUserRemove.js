const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.GuildScheduledEventUserRemove,async execute(event,user){await audit.log('scheduled_event','Пользователь отменил участие в событии',{guildId:event.guildId,eventId:event.id,userId:user.id});}};
