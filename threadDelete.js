const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.ThreadDelete,async execute(thread){await audit.log('thread','Ветка удалена',{guildId:thread.guildId,channelId:thread.parentId,threadId:thread.id,name:thread.name});}};
