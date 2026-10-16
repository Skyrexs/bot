// handlers/tempRooms.js
const db = require('../database');
const config = require('../config');
const logger = require('../logger');
const { buildTempRoomsPanel } = require('../utils/tempRoomsPanel');
const { MessageFlags, PermissionsBitField } = require('discord.js');
const audit = require('../utils').audit;

module.exports = {
  buttonIds: ['temp_create_room'],

  async handleButton(interaction) {
    if (interaction.customId !== 'temp_create_room') return;
    interaction._handled = true;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});

    try {
      // Category and template voice channel come from config: TEMP_VC_CATEGORY_ID and TEMP_VC_CREATION_VOICE_CHANNEL_ID
      const categoryId = process.env.TEMP_VC_CATEGORY_ID || config.TEMP_VC_CATEGORY_ID;
      if (!categoryId) {
        await interaction.editReply({ content: 'Категория для временных комнат не настроена.' }).catch(()=>{});
        return;
      }

      const guild = interaction.guild;
      const category = await guild.channels.fetch(categoryId).catch(()=>null);
      if (!category) {
        await interaction.editReply({ content: 'Категория не найдена.' }).catch(()=>{});
        return;
      }

      const now = Date.now();
      const id = `tmp_${now}_${Math.random().toString(36).slice(2,6)}`;

      const voiceChannel = await guild.channels.create({
        name: `🔊 комната-${interaction.user.username}`.slice(0, 90),
        type: 2, // GuildVoice
        parent: category.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak] }
        ],
        reason: `Temporary room for ${interaction.user.tag}`
      }).catch(e => { logger.warn('temp create voice fail', { error: e.message }); return null; });

      const textChannel = await guild.channels.create({
        name: `room-${interaction.user.username}`.slice(0,90),
        type: 0, // GUILD_TEXT
        parent: category.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ],
        reason: `Temporary room text for ${interaction.user.tag}`
      }).catch(e => { logger.warn('temp create text fail', { error: e.message }); return null; });

      const ttlMin = Number(process.env.TEMP_ROOM_TTL_MINUTES || 60);
      const expiresAt = Date.now() + ttlMin * 60 * 1000;

      db.db.prepare(`INSERT INTO temp_rooms (id,ownerId,voiceChannelId,textChannelId,expiresAt,createdAt) VALUES (?,?,?,?,?,?)`)
        .run(id, interaction.user.id, voiceChannel?.id || null, textChannel?.id || null, expiresAt, now);

      // Send DM and ephemeral reply
      await interaction.editReply({ content: `Временная комната создана: ${voiceChannel ? `<#${voiceChannel.id}>` : 'не удалось создать голосовой канал'}` }).catch(()=>{});

      audit.log('temproom','Created temp room', { id, owner: interaction.user.id, voiceId: voiceChannel?.id, textId: textChannel?.id });
      return;
    } catch (e) {
      logger.error('temp room create error', { error: e.message, stack: e.stack });
      await interaction.editReply({ content: 'Не удалось создать временную комнату.' }).catch(()=>{});
    }
  }
};