const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.InviteCreate,async execute(invite){await audit.log('invite','Приглашение создано',{guildId:invite.guild?.id,code:invite.code,channelId:invite.channelId,inviterId:invite.inviter?.id,maxUses:invite.maxUses,expiresAt:invite.expiresAt});}};
