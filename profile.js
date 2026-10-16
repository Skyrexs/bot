const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const db = require('../database');
const config = require('../config');
const { addBanner } = require('../utils/banner');
const { canAccessProfile } = require('../utils/permissions');

const ACHIEVEMENTS = [
  ['first_hour', 'Первый час', 'Провести первый полный час в voice'],
  ['ten_hours', '10 часов', 'Набрать 10 часов voice'],
  ['fifty_hours', '50 часов', 'Набрать 50 часов voice'],
  ['hundred_hours', '100 часов', 'Набрать 100 часов voice'],
  ['hundred_points', '100 баллов', 'Набрать 100 баллов'],
  ['seven_days', '7 дней активности', 'Иметь активность 7 разных дней'],
  ['thirty_days', '30 дней активности', 'Иметь активность 30 разных дней'],
  ['top_one', 'Топ-1', 'Занять первое место в рейтинге'],
  ['first_item', 'Первый предмет', 'Получить первый предмет со склада'],
];

function getStreak(days) {
  if (!days.length) return 0;
  const set = new Set(days);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  let cursor = today;
  if (!set.has(fmt(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (set.has(fmt(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function unlockForUser(userId) {
  const stats = db.getUserPointSummary(userId);
  const days = db.getUserVoiceActivityDays(userId);
  const streak = getStreak(days);
  const rank = db.getUserRank(userId);
  const hasItem = db.getUserTakenItems(userId).length > 0;
  const checks = {
    first_hour: stats.voiceHours >= 1,
    ten_hours: stats.voiceHours >= 10,
    fifty_hours: stats.voiceHours >= 50,
    hundred_hours: stats.voiceHours >= 100,
    hundred_points: stats.points >= 100,
    seven_days: days.length >= 7,
    thirty_days: days.length >= 30,
    top_one: rank === 1 && stats.points > 0,
    first_item: hasItem,
  };
  for (const [id, ok] of Object.entries(checks)) if (ok) db.unlockAchievement(userId, id);
  return { stats, days, streak, rank, achievements: db.getAchievementRows(userId) };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Показать профиль и статистику по баллам')
    .addUserOption((o) => o.setName('user').setDescription('Участник').setRequired(false))
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const requesterMember = interaction.member;
    if (!canAccessProfile(requesterMember)) {
      const denied = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('⛔ ДОСТУП ЗАКРЫТ')
        .setDescription('Профиль доступен только участникам с ролью **BENZO** или персоналу с правами админ-панели.');
      const bannerUrl = require('../utils/banner').getBannerUrl();
      if (bannerUrl) denied.setImage(bannerUrl);
      return interaction.editReply({
        embeds: [denied],
      });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    const data = unlockForUser(target.id);
    const targetHasBenzo = Boolean(member && config.BENZO_ROLE_ID && member.roles.cache.has(config.BENZO_ROLE_ID));
    const achievementMap = new Map(ACHIEVEMENTS.map((x) => [x[0], x]));
    const unlocked = new Set(data.achievements.map((x) => x.achievementId));
    const achievementText = ACHIEVEMENTS.map(([id, title]) => `${unlocked.has(id) ? '✅' : '🔒'} ${title}`).join('\n');

    const bannerUrl = require('../utils/banner').getBannerUrl();
    const embed = new EmbedBuilder()
      .setColor(targetHasBenzo ? 0x7C4DFF : 0x555555)
      .setTitle(`👤 ПРОФИЛЬ • ${target.username}`)
      .addFields(
        {
          name: '📊 Статистика',
          value:
            `> ⭐ **Баллы:** ${data.stats.points.toFixed(1)}\n` +
            `> 🎙️ **Voice:** ${data.stats.voiceHours.toFixed(0)} полных часов\n` +
            `> 📈 **Место:** #${data.rank}\n` +
            `> 🔥 **Серия:** ${data.streak} дн.\n` +
            `> ${targetHasBenzo ? '🟢 BENZO' : '⚪ Без BENZO'}`,
          inline: false,
        },
        {
          name: '💰 Баланс и история',
          value:
            `> Начислено всего: **${data.stats.earned.toFixed(1)}**\n` +
            `> Списано всего: **${data.stats.spent.toFixed(1)}**\n` +
            `> Voice даёт **1 балл за каждый полный час**.`,
          inline: false,
        },
        {
          name: '🏆 Достижения',
          value: achievementText.slice(0, 1024),
          inline: false,
        },
      )
      .setFooter({ text: `ID: ${target.id} • BENZO PROFILE` });

    if (bannerUrl) embed.setImage(bannerUrl);

    const payload = { embeds: [embed] };
    if (target.id === interaction.user.id) {
      payload.components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('profile_history')
            .setLabel('📜 История баллов')
            .setStyle(ButtonStyle.Secondary)
        ),
      ];
    }

    return interaction.editReply(payload);
  },
};
