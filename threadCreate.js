const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.ThreadCreate,async execute(thread){await audit.log('thread','Ветка создана',{guildId:thread.guildId,channelId:thread.parentId,threadId:thread.id,name:thread.name,ownerId:thread.ownerId});}};
