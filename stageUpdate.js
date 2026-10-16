const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.StageInstanceUpdate,async execute(oldStage,newStage){await audit.log('stage','Stage instance изменён',{guildId:newStage.guildId,channelId:newStage.channelId,stageId:newStage.id,oldTopic:oldStage.topic,newTopic:newStage.topic});}};
