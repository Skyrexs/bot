const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.ThreadUpdate,async execute(oldThread,newThread){await audit.log('thread','Ветка изменена',{guildId:newThread.guildId,threadId:newThread.id,oldName:oldThread.name,newName:newThread.name,oldArchived:oldThread.archived,newArchived:newThread.archived,oldLocked:oldThread.locked,newLocked:newThread.locked});}};
