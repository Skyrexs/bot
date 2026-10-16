const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports={name:Events.StageInstanceDelete,async execute(stage){await audit.log('stage','Stage instance удалён',{guildId:stage.guildId,channelId:stage.channelId,stageId:stage.id,topic:stage.topic});}};
