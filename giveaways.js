// handlers/giveaways.js
const db = require('../database');
const logger = require('../logger');
const config = require('../config');
const audit = require('../utils').audit;
const { buildGiveawayAdminPanel, buildGiveawayModal, buildGiveawayMessage } = require('../utils/giveawayPanel');
const { MessageFlags } = require('discord.js');

module.exports = {
  buttonIds: ['giveaway_create', 'giveaway_list'],
  buttonPrefixes: ['giveaway_join_'],
  modalPrefixes: ['giveaway_modal'],

  async handleButton(interaction) {
    const id = interaction.customId;

    if (id === 'giveaway_create') {
      interaction._handled = true;
      try {
        const modal = buildGiveawayModal();
        return await interaction.showModal(modal);
      } catch (e) {
        logger.error('giveaway show modal error', { error: e.message });
      }
    }

    if (id === 'giveaway_list') {
      interaction._handled = true;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
      const list = db.db.prepare('SELECT * FROM giveaways WHERE status = ? ORDER BY createdAt DESC').all('active');
      if (!list.length) {
        return interaction.editReply({ content: 'Активных розыгрышей нет.' }).catch(()=>{});
      }
      const text = list.map(g => `• ${g.title} — Приз: ${g.prize} — окончание <t:${Math.floor(g.endsAt/1000)}:R>`).join('\n');
      return interaction.editReply({ content: text }).catch(()=>{});
    }

    if (id.startsWith('giveaway_join_')) {
      interaction._handled = true;
      const gid = id.replace('giveaway_join_', '');
      const g = db.db.prepare('SELECT * FROM giveaways WHERE id = ?').get(gid);
      if (!g || g.status !== 'active') {
        return interaction.reply({ content: 'Этот розыгрыш завершён или не найден.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      }
      // Store participation: simple table giveaways_participants
      db.db.prepare(`INSERT OR IGNORE INTO giveaways_participants (giveawayId,userId,joinedAt) VALUES (?,?,?)`).run(gid, interaction.user.id, Date.now());
      await interaction.reply({ content: 'Вы участвуете в розыгрыше!', flags: MessageFlags.Ephemeral }).catch(()=>{});
      return;
    }
  },

  async handleModal(interaction) {
    if (interaction.customId !== 'giveaway_modal') return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
    try {
      const title = interaction.fields.getTextInputValue('g_title').trim();
      const prize = interaction.fields.getTextInputValue('g_prize').trim();
      const durationMin = Math.max(1, Number(interaction.fields.getTextInputValue('g_duration').trim()) || 1);
      const id = `gav_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      const now = Date.now();
      const endsAt = now + durationMin * 60 * 1000;
      db.db.prepare(`INSERT INTO giveaways (id,title,prize,channelId,messageId,endsAt,createdBy,status,createdAt) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(id, title, prize, null, null, endsAt, interaction.user.id, 'active', now);

      // send to configured channel
      const chId = process.env.GIVEAWAY_CHANNEL_ID || config.REVIEW_CHANNEL_ID;
      const ch = interaction.guild.channels.cache.get(chId) || await interaction.guild.channels.fetch(chId).catch(()=>null);
      if (ch && ch.isTextBased && ch.isTextBased()) {
        const g = { id, title, prize, endsAt };
        const { container } = buildGiveawayMessage(g);
        const sent = await ch.send({ components: [container], content: null }).catch(()=>null);
        if (sent) db.db.prepare('UPDATE giveaways SET channelId=?, messageId=? WHERE id=?').run(ch.id, sent.id, id);
      }

      await interaction.editReply({ content: 'Розыгрыш создан.' }).catch(()=>{});
      audit.log('giveaway', 'Created giveaway', { id, by: interaction.user.id, title, prize, endsAt });
    } catch (e) {
      logger.error('giveaway modal error', { error: e.message, stack: e.stack });
      await interaction.editReply({ content: 'Не удалось создать розыгрыш.' }).catch(()=>{});
    }
  },

  // scheduled internal helper: finishGiveaway(giveawayId) - to be called by external scheduler (ready.js sets timers)
};