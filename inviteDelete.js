const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.InviteDelete,async execute(invite){await audit.log('invite','Приглашение удалено',{guildId:invite.guild?.id,code:invite.code,channelId:invite.channelId});}};
