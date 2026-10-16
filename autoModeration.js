const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.AutoModerationActionExecution,async execute(action){await audit.log('automod','Сработала AutoMod акция',{guildId:action.guildId,ruleId:action.ruleId,ruleTriggerType:action.ruleTriggerType,userId:action.userId,channelId:action.channelId,actionType:action.action?.type});}};
