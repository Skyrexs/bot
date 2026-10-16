const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.StageInstanceCreate,async execute(stage){await audit.log('stage','Stage instance создан',{guildId:stage.guildId,channelId:stage.channelId,stageId:stage.id,topic:stage.topic});}};
