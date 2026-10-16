const {
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');
const config = require('../config');
const logger = require('../logger');
const db = require('../database');
const { hasModeratorAccess, hasFullAdminAccess } = require('../utils/permissions');
const {
  setAFK,
  removeAFK,
  getSetting,
  setSetting,
  setCooldown,
  removeCooldown,
  addPoints,
  removePoints,
  getPoints,
  bulkAddPoints,
  bulkRemovePoints,
  resetAllPoints,
  getTopPoints,
  getAllAFK,
  getBlacklist,
  addToBlacklist,
  removeFromBlacklist,
  saveCaught,
  saveMCL,
  getAllCaughtLists,
  getAllMCLLists,
  getCaughtList,
  getMCLList,
  updateCaughtList,
  updateMCLList,
  deleteCaughtFromDB,
  deleteMCLFromDB,
  deleteCaughtByChannel,
  deleteMCLByChannel,
  resetEntireDatabase,
  clearAllRosters,
  createTierTicket,
  getOpenTierTicketByUser,
  deleteTierTicketByUser,
} = db;
const utils = require('../utils');
const audit = utils.audit;

function hasAdminRole(member) {
  return hasModeratorAccess(member);
}

function hasFullAdminRole(member) {
  return hasFullAdminAccess(member);
}

function normalizeUserId(target, guild) {
  if (!target) return null;
  let id = target.trim();
  if (id.startsWith('<@') && id.endsWith('>')) id = id.replace(/[<@!>]/g, '');
  if (/^\d+$/.test(id)) return id;
  if (!guild) return null;
  const lower = target.toLowerCase();
  const member = guild.members.cache.find((m) => m.user.tag.toLowerCase() === lower || m.user.username.toLowerCase() === lower || m.displayName.toLowerCase() === lower);
  return member ? member.id : null;
}

function normalizeRoleTarget(target, guild) {
  if (!target) return null;
  let id = target.trim();
  if (id.startsWith('<@&') && id.endsWith('>')) id = id.replace(/[<@&>]/g, '');
  if (/^\d+$/.test(id)) return id;
  if (!guild) return null;
  const lower = target.toLowerCase();
  const role = guild.roles.cache.find((r) => r.name.toLowerCase() === lower || r.id === id);
  return role ? role.id : null;
}

function getTierRoleByLabel(label, guild) {
  if (!label) return null;
  const tierRoles = config.TIER_ROLES || {};
  const key = Object.keys(tierRoles).find((k) => k.toLowerCase() === label.toLowerCase() || tierRoles[k] === label);
  if (key && tierRoles[key]) return tierRoles[key];
  const roleId = normalizeRoleTarget(label, guild);
  return roleId;
}

const rosterReminderTimers = new Map();

function buildSelectRow(customId, placeholder, options) {
  const select = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(
    options.map((opt) => new StringSelectMenuOptionBuilder().setLabel(opt.label).setValue(opt.value))
  );
  return new ActionRowBuilder().addComponents(select);
}

function clearRosterReminder(listId) {
  const timer = rosterReminderTimers.get(listId);
  if (timer) {
    clearTimeout(timer);
    rosterReminderTimers.delete(listId);
  }
}

function clearAllRosterReminders() {
  for (const timer of rosterReminderTimers.values()) {
    clearTimeout(timer);
  }
  rosterReminderTimers.clear();
}

function parseRosterTimeToDate(time, reference = new Date()) {
  if (!time || typeof time !== 'string') return null;
  const match = time.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const target = new Date(reference);
  target.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return target;
}

function rosterDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildRosterReminderTargets(list, channelId = null, type = null) {
  const normalizedType = type || (String(list?.id || '').startsWith('capt_') ? 'capt' : 'mcl');
  const userIds = Array.from(new Set([...(list?.main || []), ...(list?.subs || [])]));
  return {
    type: normalizedType,
    userIds,
    channelId: channelId || list?.channelId || null,
  };
}

function getNextRosterEvent(time, reference = new Date(), lastReminderDate = null) {
  let event = parseRosterTimeToDate(time, reference);
  if (!event) return null;
  if (event.getTime() <= reference.getTime()) event.setDate(event.getDate() + 1);
  if (lastReminderDate && rosterDateKey(event) === lastReminderDate) {
    event.setDate(event.getDate() + 1);
  }
  return event;
}

async function sendRosterReminder(client, list, type, markSent = true, eventDate = null) {
  const freshList = type === 'capt'
    ? getCaughtList(list.id)
    : getMCLList(list.id);

  if (!freshList) {
    clearRosterReminder(list.id);
    return 0;
  }

  const reminderTargets = buildRosterReminderTargets(freshList, freshList.channelId || null, type);
  const members = reminderTargets.userIds;
  if (!members.length && !reminderTargets.channelId) {
    clearRosterReminder(list.id);
    return 0;
  }

  const text = `Через 5 минут начинается ${type.toUpperCase()} список **${freshList.id}** в **${freshList.time}**.\nПроверьте, что вы готовы.`;
  let sentCount = 0;
  for (const userId of members) {
    try {
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) continue;
      const payload = {
        accentColor: 0x7C4DFF,
        title: `${type.toUpperCase()} • НАПОМИНАНИЕ`,
        body: text,
        footer: 'BENZO • CAPT/MCL',
      };
      let sent = await utils.sendDM(user, payload).catch(() => false);
      if (sent === false) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        sent = await utils.sendDM(user, payload).catch(() => false);
      }
      if (sent !== false) sentCount += 1;
    } catch (e) {
      logger.warn('Failed to send roster reminder DM', { error: e.message, userId, listId: list.id, type });
    }
  }

  if (reminderTargets.channelId && (!members.length || sentCount < members.length)) {
    const channel = await client.channels.fetch(reminderTargets.channelId).catch(() => null);
    if (channel && typeof channel.send === 'function') {
      const channelText = `@here Напоминание: ${type.toUpperCase()} список **${freshList.id}** начинается через 5 минут (${freshList.time}).`;
      await channel.send({ content: channelText }).catch(() => null);
      sentCount += 1;
    }
  }

  if (markSent && eventDate) {
    const key = rosterDateKey(eventDate);
    if (type === 'capt') db.db.prepare('UPDATE capts SET reminderSent=1, reminderDate=? WHERE id=?').run(key, list.id);
    else db.db.prepare('UPDATE mcls SET reminderSent=1, reminderDate=? WHERE id=?').run(key, list.id);
  }
  audit.log('roster', 'Roster reminder sent', { listId: list.id, type, members: members.length, sentCount });
  clearRosterReminder(list.id);
  return sentCount;
}

async function sendCombinedRosterReminders(client, lists) {
  const byUser = new Map();
  for (const list of lists) {
    const type = String(list.id || '').startsWith('capt_') ? 'CAPT' : 'MCL';
    for (const userId of new Set([...(list.main || []), ...(list.subs || [])])) {
      if (!byUser.has(userId)) byUser.set(userId, []);
      byUser.get(userId).push({ type, id: list.id, time: list.time, position: list.main?.includes(userId) ? 'основа' : 'замена' });
    }
  }
  let sentCount = 0;
  for (const [userId, rosters] of byUser) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) continue;
    const body = ['**Напоминание по активным спискам:**', '', ...rosters.map((r) => `• **${r.type}** — \`${r.time}\` — ${r.position}`), '', 'Проверьте готовность к началу.'].join('\n');
    const sent = await utils.sendDM(user, { accentColor: 0x7C4DFF, title: '<a:483a045a18644d3c8de001ce288bc40a:1507119681474007151> CAPT / MCL • НАПОМИНАНИЕ', body, footer: 'BENZO • CAPT/MCL' }).catch(() => false);
    if (sent !== false) sentCount += 1;
  }
  audit.log('roster', 'Combined manual roster reminders sent', { users: byUser.size, sentCount, lists: lists.map((l) => l.id) });
  return sentCount;
}

function scheduleRosterReminder(client, list, type) {
  if (!client || !list) return;
  clearRosterReminder(list.id);
  const now = new Date();
  const event = getNextRosterEvent(list.time, now, list.reminderDate || null);
  if (!event) return;
  const reminder = new Date(event.getTime() - 5 * 60 * 1000);

  if (now.getTime() >= reminder.getTime() && now.getTime() < event.getTime()) {
    void sendRosterReminder(client, list, type, true, event).then(() => {
      const updated = type === 'capt' ? getCaughtList(list.id) : getMCLList(list.id);
      if (updated) scheduleRosterReminder(client, updated, type);
    }).catch((e) => logger.error('Late roster reminder failed', { error: e.message, listId: list.id, type }));
    return;
  }

  const delay = Math.max(1000, reminder.getTime() - now.getTime());
  const timer = setTimeout(async () => {
    try {
      await sendRosterReminder(client, list, type, true, event);
      const updated = type === 'capt' ? getCaughtList(list.id) : getMCLList(list.id);
      if (updated) scheduleRosterReminder(client, updated, type);
    } catch (e) {
      logger.error('Roster reminder error', { error: e.message, listId: list.id, type });
    }
  }, delay);
  rosterReminderTimers.set(list.id, timer);
}

function scheduleRosterFromSummary(client, list, type) {
  if (!client || !list || !type) return;
  scheduleRosterReminder(client, list, type);
}

module.exports = {
  buildRosterReminderTargets,
  selectIds: [
    'admin_panel_select',
    'shop_admin_select',
    'tier_admin_select',
    'roster_admin_select',
    'roster_list_select',
    'blacklist_admin_select',
    'afk_admin_select',
  ],
  buttonPrefixes: ['admin_toggle_tier_btn', 'admin_reset_points_confirm_', 'admin_reset_points_cancel'],
  modalPrefixes: [
    'admin_afk_add_modal',
    'admin_afk_remove_modal',
    'admin_cooldown_modal',
    'admin_shop_add_user_modal',
    'admin_shop_remove_user_modal',
    'admin_shop_add_role_modal',
    'admin_shop_remove_role_modal',
    'admin_shop_view_user_modal',
    'admin_tier_user_modal',
    'admin_tier_request_modal',
    'admin_tier_remove_modal',
    'admin_tier_delete_modal',
    'admin_roster_create_capt_modal',
    'admin_roster_create_mcl_modal',
    'admin_roster_add_modal',
    'admin_roster_remove_modal',
    'admin_roster_time_modal',
    'admin_blacklist_add_modal',
    'admin_blacklist_remove_modal',
  ],

  clearAllRosterReminders,
  clearRosterReminder,

  async handleSelect(interaction) {
    if (!interaction.member) return;
    if (!hasAdminRole(interaction.member)) {
      audit.log('admin', 'Unauthorized admin panel access', { by: interaction.user.id });
      return interaction.reply({ content: 'У вас нет прав для управления.', flags: MessageFlags.Ephemeral }).catch(()=>{});
    }

    const customId = interaction.customId;
    const value = interaction.values?.[0];

    if (customId === 'admin_panel_select') {
      if (!value) return interaction.reply({ content: 'Выберите действие.', flags: MessageFlags.Ephemeral }).catch(()=>{});

      if (value === 'database_reset' || value === 'command_health' || value === 'command_backup' || value === 'cooldown_menu' || value === 'warehouse_admin_menu' || value === 'tier_admin_menu') {
        if (!hasFullAdminRole(interaction.member)) {
          return interaction.reply({ content: 'Доступ запрещён. Это действие доступно только полному администратору.', flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
      }

      if (value === 'database_reset') {
        const container = new ContainerBuilder().setAccentColor(0xFF0000);
        require('../utils/banner').addBanner(container);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151> ПОЛНОЕ УДАЛЕНИЕ БАЗЫ ДАННЫХ\n\nБудут удалены **все записи из всех таблиц**: пользователи, баллы, история, заявки, TIER, CAPT/MCL, AFK, кулдауны, склад, достижения, настройки и прочие данные.\n\nЭто действие **необратимо**.'));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addActionRowComponents(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`admin_full_db_reset_confirm_${interaction.user.id}`).setLabel('ДА, УДАЛИТЬ ВСЁ').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`admin_full_db_reset_cancel_${interaction.user.id}`).setLabel('Отмена').setStyle(ButtonStyle.Secondary)
        ));
        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(()=>{});
      }

      if (value === 'command_health') {
        const health = db.getDatabaseHealth();
        const c = new ContainerBuilder().setAccentColor(health.ok ? 0x2ECC71 : 0xE74C3C);
        require('../utils/banner').addBanner(c);
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151> СОСТОЯНИЕ БОТА\n` +
            `> База данных: **${health.ok ? 'OK' : 'ОШИБКА'}**\n` +
            `> SQLite integrity: **${health.integrity}**\n` +
            `> Режим журнала: **${health.journalMode}**\n` +
            `> Таблиц: **${health.tables.length}**`
          )
        );
        c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        const nonEmpty = Object.entries(health.counts)
          .filter(([, count]) => Number(count) > 0)
          .slice(0, 20)
          .map(([table, count]) => `• \`${table}\`: **${count}**`)
          .join('\n') || 'Все таблицы пусты.';
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(nonEmpty));
        return interaction.reply({
          components: [c],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        }).catch(() => {});
      }

      if (value === 'command_backup') {
        const maintenance = require('../utils/maintenance');
        const result = await maintenance.createDatabaseBackup('manual_admin');
        if (!result.ok) {
          return interaction.reply({
            content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Не удалось создать резервную копию: ${result.error}`,
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }
        return interaction.reply({
          content: `<a:ok8:1509635360475582565> Резервная копия создана: \`${result.fileName}\` (${result.sizeBytes} байт).`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }

      if (value === 'create_capt' || value === 'create_mcl') {
        const modal = new ModalBuilder().setCustomId(value === 'create_capt' ? 'admin_roster_create_capt_modal' : 'admin_roster_create_mcl_modal');
        modal.setTitle(value === 'create_capt' ? 'Создать CAPT' : 'Создать MCL');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_time').setLabel('Время (например: 21:00)').setStyle(TextInputStyle.Short).setRequired(true))
        );
        interaction._handled = true;
        return interaction.showModal(modal).catch(async (err) => {
          logger.warn('Failed to show create capt/mcl modal', { error: err.message });
          if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Не удалось открыть форму.', flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
      }

      if (value === 'afk_menu') {
        const options = [
          { value: 'afk_admin_list', label: 'Показать AFK список' },
          { value: 'afk_admin_add', label: 'Добавить в AFK' },
          { value: 'afk_admin_remove', label: 'Убрать из AFK' },
        ];
        return interaction.reply({ content: 'Управление AFK.', components: [buildSelectRow('afk_admin_select', 'AFK — действие', options)], flags: MessageFlags.Ephemeral }).catch(()=>{});
      }

      if (value === 'cooldown_menu') {
        const modal = new ModalBuilder().setCustomId('admin_cooldown_modal').setTitle('Управление кулдауном');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cooldown_user').setLabel('User ID или @mention').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cooldown_days').setLabel('Дни кулдауна (0 = снять)').setStyle(TextInputStyle.Short).setRequired(true))
        );
        interaction._handled = true;
        return interaction.showModal(modal).catch(async (err) => {
          logger.warn('admin cooldown modal open failed', { error: err.message });
          if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Не удалось открыть форму.', flags: MessageFlags.Ephemeral }).catch(()=>{});
        });
      }

      if (value === 'warehouse_admin_menu') {
        const panel = await require('../handlers/warehouseAdmin').buildWarehouseAdminPanel();
        return interaction.reply({ components: panel.components, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(()=>{});
      }

      if (value === 'shop_admin_menu') {
        const options = [
          { value: 'shop_admin_add_user', label: 'Выдать баллы пользователю' },
          { value: 'shop_admin_remove_user', label: 'Списать баллы у пользователя' },
          { value: 'shop_admin_add_role', label: 'Выдать баллы роли' },
          { value: 'shop_admin_remove_role', label: 'Списать баллы у роли' },
          { value: 'shop_admin_view_user', label: 'Посмотреть баллы пользователя' },
          { value: 'shop_admin_top', label: 'Показать топ баллов' },
          { value: 'shop_admin_reset_all', label: 'Обнулить баллы всем BENZO' },
        ];
        return interaction.reply({ content: 'Выберите действие магазина.', components: [buildSelectRow('shop_admin_select', 'Магазин — действие', options)], flags: MessageFlags.Ephemeral }).catch(()=>{});
      }

      if (value === 'tier_admin_menu') {
        const options = [
          { value: 'tier_admin_toggle', label: 'Открыть/закрыть приём TIER' },
          { value: 'tier_admin_request_create', label: 'Создать запрос TIER для пользователя' },
          { value: 'tier_admin_request_delete', label: 'Удалить запрос TIER пользователя' },
        ];
        return interaction.reply({ content: 'Управление TIER.', components: [buildSelectRow('tier_admin_select', 'TIER — действие', options)], flags: MessageFlags.Ephemeral }).catch(()=>{});
      }

      if (value === 'roster_menu') {
        const options = [
          { value: 'roster_admin_view_capt', label: 'Показать CAPT списки' },
          { value: 'roster_admin_view_mcl', label: 'Показать MCL списки' },
          { value: 'roster_admin_create_capt', label: 'Создать CAPT список' },
          { value: 'roster_admin_create_mcl', label: 'Создать MCL список' },
          { value: 'roster_admin_add_member', label: 'Добавить участника в список' },
          { value: 'roster_admin_remove_member', label: 'Убрать участника из списка' },
          { value: 'roster_admin_change_time', label: 'Изменить время списка' },
          { value: 'roster_admin_remind_all', label: 'Отправить напоминание всем в списке' },
          { value: 'roster_admin_clear', label: 'Очистить все списки' },
        ];
        return interaction.reply({ content: 'Управление списками CAPT/MCL.', components: [buildSelectRow('roster_admin_select', 'Списки — действие', options)], flags: MessageFlags.Ephemeral }).catch(()=>{});
      }

      if (value === 'roster_admin_add_member' || value === 'roster_admin_remove_member' || value === 'roster_admin_change_time' || value === 'roster_admin_remind_all') {
        const allCapts = getAllCaughtLists();
        const allMcls = getAllMCLLists();
        const allLists = [];

        allCapts.forEach(c => allLists.push({ value: `capt_${c.id}`, label: `CAPT: ${c.time} (ID: ${c.id})` }));
        allMcls.forEach(m => allLists.push({ value: `mcl_${m.id}`, label: `MCL: ${m.time} (ID: ${m.id})` }));

        if (!allLists.length) {
          return interaction.reply({ content: 'Нет доступных CAPT/MCL списков. Сначала создайте список.', flags: MessageFlags.Ephemeral }).catch(()=>{});
        }

        global.__rosterAction = value;
        return interaction.reply({ content: 'Выберите список CAPT/MCL:', components: [buildSelectRow('roster_list_select', 'Выберите список', allLists)], flags: MessageFlags.Ephemeral }).catch(()=>{});
      }

      if (value === 'blacklist_menu') {
        const options = [
          { value: 'blacklist_admin_list', label: 'Показать чёрный список' },
          { value: 'blacklist_admin_add', label: 'Добавить в чёрный список' },
          { value: 'blacklist_admin_remove', label: 'Убрать из чёрного списка' },
        ];
        return interaction.reply({ content: 'Управление чёрным списком.', components: [buildSelectRow('blacklist_admin_select', 'ЧС — действие', options)], flags: MessageFlags.Ephemeral }).catch(()=>{});
      }

      return interaction.reply({ content: 'Опция не реализована.', flags: MessageFlags.Ephemeral }).catch(()=>{});
    }

    if (customId === 'afk_admin_select') {
      if (!value) return interaction.reply({ content: 'Выберите действие.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      if (value === 'afk_admin_list') {
        const list = getAllAFK(interaction.guild.id);
        if (!list.length) return interaction.reply({ content: 'AFK список пуст.', flags: MessageFlags.Ephemeral }).catch(()=>{});
        const summary = list.slice(0, 20).map((item) => `• <@${item.userId}> — ${item.reason || 'без причины'}`).join('\n');
        return interaction.reply({ content: `AFK список:\n${summary}`, flags: MessageFlags.Ephemeral }).catch(()=>{});
      }
      const modal = new ModalBuilder().setCustomId(value === 'afk_admin_add' ? 'admin_afk_add_modal' : 'admin_afk_remove_modal');
      modal.setTitle(value === 'afk_admin_add' ? 'Добавить в AFK (вручную)' : 'Убрать из AFK (вручную)');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('afk_user').setLabel('User ID или @mention').setStyle(TextInputStyle.Short).setRequired(true)));
      if (value === 'afk_admin_add') {
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('afk_reason').setLabel('Причина (опционально)').setStyle(TextInputStyle.Paragraph).setRequired(false)));
      }
      interaction._handled = true;
      return interaction.showModal(modal).catch(async (err) => {
        logger.warn('admin afk modal open failed', { error: err.message });
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Не удалось открыть форму.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      });
    }

    if (customId === 'shop_admin_select') {
      if (!value) return interaction.reply({ content: 'Выберите действие.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      if (value === 'shop_admin_reset_all') {
        if (!hasFullAdminRole(interaction.member)) {
          return interaction.reply({ content: 'Доступ запрещён. Обнуление баллов доступно только полному администратору.', flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
        const c = new ContainerBuilder().setAccentColor(0xFF3B30);
        require('../utils/banner').addBanner(c);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
          '## <:vnimanie:1509630676603764737> ОБНУЛЕНИЕ БАЛЛОВ ВСЕМ BENZO\n\n' +
          'Это удалит текущий баланс у всех участников с ролью BENZO и сбросит их активные voice-таймеры.\n' +
          '**Действие необратимо для баланса.**'
        ));
        c.addActionRowComponents(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`admin_reset_points_confirm_${interaction.user.id}`).setLabel('Да, обнулить').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('admin_reset_points_cancel').setLabel('Отмена').setStyle(ButtonStyle.Secondary)
        ));
        return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
      }
      if (value === 'shop_admin_top') {
        const members = await interaction.guild.members.fetch();
        const top = getTopPoints(1000)
          .filter((item) => {
            const member = members.get(item.userId);
            return Boolean(
              member &&
              config.BENZO_ROLE_ID &&
              member.roles.cache.has(config.BENZO_ROLE_ID)
            );
          })
          .slice(0, 10);

        if (!top.length) {
          return interaction.reply({
            content: 'Топ поинтов BENZO пуст.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }

        const list = top
          .map((item, index) =>
            `${index + 1}. <@${item.userId}> — **${Number(item.points).toFixed(1)}**`
          )
          .join('\n');

        return interaction.reply({
          content: `Топ поинтов BENZO:\n${list}`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }

      const shopAction = value.replace(/^shop_admin_/, 'shop_');
      const modal = new ModalBuilder().setCustomId(`admin_${shopAction}_modal`);
      if (value === 'shop_admin_view_user') {
        modal.setTitle('Посмотреть баллы пользователя');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('shop_user').setLabel('User ID или @mention').setStyle(TextInputStyle.Short).setRequired(true)));
      } else if (value === 'shop_admin_add_user' || value === 'shop_admin_remove_user') {
        modal.setTitle(value === 'shop_admin_add_user' ? 'Выдать баллы пользователю' : 'Списать баллы у пользователя');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('shop_user').setLabel('User ID или @mention').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('shop_amount').setLabel('Сумма баллов').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: 10'))
        );
      } else if (value === 'shop_admin_add_role' || value === 'shop_admin_remove_role') {
        modal.setTitle(value === 'shop_admin_add_role' ? 'Выдать баллы роли' : 'Списать баллы у роли');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('shop_role').setLabel('Role ID / @mention / название').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('shop_amount').setLabel('Сумма баллов').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: 10'))
        );
      }
      interaction._handled = true;
      return interaction.showModal(modal).catch(async (err) => {
        logger.warn('Failed to show shop admin modal', { error: err.message });
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Не удалось открыть форму.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      });
    }

    if (customId === 'tier_admin_select') {
      if (!value) return interaction.reply({ content: 'Выберите действие.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      if (value === 'tier_admin_toggle') {
        const current = getSetting('tier_open', '1') === '1';
        setSetting('tier_open', current ? '0' : '1');
        audit.log('admin', 'Tier open toggled', { by: interaction.user.id, newState: !current });
        return interaction.reply({ content: `Приём заявок на TIER теперь **${current ? 'ЗАКРЫТ' : 'ОТКРЫТ'}**.`, flags: MessageFlags.Ephemeral }).catch(()=>{});
      }
      const modal = new ModalBuilder().setCustomId(
        value === 'tier_admin_request_delete'
          ? 'admin_tier_delete_modal'
          : 'admin_tier_request_modal'
      );
      modal.setTitle(value === 'tier_admin_request_delete' ? 'Удалить запрос TIER' : 'Создать запрос TIER');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tier_user').setLabel('User ID или @mention').setStyle(TextInputStyle.Short).setRequired(true)));
      if (value === 'tier_admin_request_create') {
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tier_note').setLabel('Комментарий или роль запроса (опционально)').setStyle(TextInputStyle.Paragraph).setRequired(false)));
      }
      interaction._handled = true;
      return interaction.showModal(modal).catch(async (err) => {
        logger.warn('Failed to show tier admin modal', { error: err.message });
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Не удалось открыть форму.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      });
    }

    if (customId === 'roster_admin_select') {
      if (!value) return interaction.reply({ content: 'Выберите действие.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      if (value === 'roster_admin_view_capt') {
        const lists = getAllCaughtLists();
        if (!lists.length) return interaction.reply({ content: 'CAPT списки не найдены.', flags: MessageFlags.Ephemeral }).catch(()=>{});
        const summary = lists.slice(0, 10).map((list) => `• ${list.id} (${list.time}) — main:${list.main.length}, subs:${list.subs.length}`).join('\n');
        return interaction.reply({ content: `CAPT списки:\n${summary}
...`, flags: MessageFlags.Ephemeral }).catch(()=>{});
      }
      if (value === 'roster_admin_view_mcl') {
        const lists = getAllMCLLists();
        if (!lists.length) return interaction.reply({ content: 'MCL списки не найдены.', flags: MessageFlags.Ephemeral }).catch(()=>{});
        const summary = lists.slice(0, 10).map((list) => `• ${list.id} (${list.time}) — main:${list.main.length}, subs:${list.subs.length}`).join('\n');
        return interaction.reply({ content: `MCL списки:\n${summary}
...`, flags: MessageFlags.Ephemeral }).catch(()=>{});
      }
      if (value === 'roster_admin_remind_all') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const lists = [
            ...getAllCaughtLists(),
            ...getAllMCLLists(),
          ];

          const total = await sendCombinedRosterReminders(
            interaction.client,
            lists
          );

          audit.log('roster', 'Manual roster reminders sent', {
            by: interaction.user.id,
            total,
            lists: lists.length,
          });

          return interaction.editReply({
            content:
              `Напоминание отправлено. Получателей: **${total}**.\n` +
              `Каждый участник получил максимум **одно ЛС**, даже если находится в нескольких списках.`,
          });
        } catch (e) {
          logger.error('manual roster reminder failed', {
            error: e.message,
            stack: e.stack,
          });
          return interaction.editReply({
            content: 'Не удалось отправить напоминания.',
          });
        }
      }

      if (value === 'roster_admin_clear') {
        if (!hasFullAdminRole(interaction.member)) {
          return interaction.reply({ content: 'Доступ запрещён. Очистка всех списков доступна только полному администратору.', flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
        clearAllRosters();
        clearAllRosterReminders();
        audit.log('admin', 'Cleared all rosters', { by: interaction.user.id });
        return interaction.reply({ content: 'Все списки CAPT/MCL очищены.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      }
      const modal = new ModalBuilder().setCustomId(`admin_${value}_modal`);
      if (value === 'roster_admin_create_capt' || value === 'roster_admin_create_mcl') {
        modal.setTitle(value === 'roster_admin_create_capt' ? 'Создать CAPT список' : 'Создать MCL список');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_time').setLabel('Время списка').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: 21:00'))
        );
      } else if (value === 'roster_admin_add_member' || value === 'roster_admin_remove_member') {
        modal.setTitle(value === 'roster_admin_add_member' ? 'Добавить участника в список' : 'Убрать участника из списка');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_list').setLabel('ID списка CAPT/MCL').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_part').setLabel('main или subs').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('main или subs')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_user').setLabel('User ID или @mention').setStyle(TextInputStyle.Short).setRequired(true))
        );
      } else if (value === 'roster_admin_change_time') {
        modal.setTitle('Изменить время списка');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_list').setLabel('ID списка CAPT/MCL').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_time').setLabel('Новое время').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: 21:00'))
        );
      }
      interaction._handled = true;
      return interaction.showModal(modal).catch(async (err) => {
        logger.warn('Failed to show roster admin modal', { error: err.message });
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Не удалось открыть форму.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      });
    }

    if (customId === 'roster_list_select') {
      if (!value) return interaction.reply({ content: 'Выберите список.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      
      const action = global.__rosterAction;
      if (!action) return interaction.reply({ content: 'Ошибка: действие не определено. Попробуйте снова.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      
      const [type, listId] = value.split('_');
      
      if (action === 'roster_admin_remind_all') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const list = type === 'capt' ? getCaughtList(listId) : getMCLList(listId);
          if (!list) return interaction.editReply({ content: 'Список не найден.' }).catch(()=>{});
          
          const main = list.main ? JSON.parse(list.main) : [];
          const subs = list.subs ? JSON.parse(list.subs) : [];
          const allUsers = [...main, ...subs];
          
          if (!allUsers.length) return interaction.editReply({ content: 'Список пуст.' }).catch(()=>{});
          
          let sent = 0;
          for (const userId of allUsers) {
            try {
              const user = await interaction.client.users.fetch(userId).catch(() => null);
              if (user) {
                await user.send(`Напоминание: ${type.toUpperCase()} ${list.time} начинается скоро!`).catch(() => {});
                sent++;
              }
            } catch {}
          }
          
          audit.log('roster', 'Roster reminder sent', { type, listId, sent, total: allUsers.length });
          return interaction.editReply({ content: `Напоминание отправлено ${sent} участникам из ${allUsers.length}.` }).catch(()=>{});
        } catch (e) {
          logger.error('Roster reminder failed', { error: e.message });
          return interaction.editReply({ content: 'Ошибка при отправке напоминания.' }).catch(()=>{});
        }
      }
      
      const modal = new ModalBuilder().setCustomId(`admin_${action}_modal`);
      if (action === 'roster_admin_add_member' || action === 'roster_admin_remove_member') {
        modal.setTitle(action === 'roster_admin_add_member' ? 'Добавить участника в список' : 'Убрать участника из списка');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_list').setLabel('ID списка').setStyle(TextInputStyle.Short).setRequired(true).setValue(listId)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_type').setLabel('Тип списка').setStyle(TextInputStyle.Short).setRequired(true).setValue(type)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_part').setLabel('main или subs').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('main или subs')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_user').setLabel('User ID или @mention').setStyle(TextInputStyle.Short).setRequired(true))
        );
      } else if (action === 'roster_admin_change_time') {
        modal.setTitle('Изменить время списка');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_list').setLabel('ID списка').setStyle(TextInputStyle.Short).setRequired(true).setValue(listId)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_type').setLabel('Тип списка').setStyle(TextInputStyle.Short).setRequired(true).setValue(type)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roster_time').setLabel('Новое время').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: 21:00'))
        );
      }
      
      interaction._handled = true;
      return interaction.showModal(modal).catch(async (err) => {
        logger.warn('Failed to show roster action modal', { error: err.message });
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Не удалось открыть форму.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      });
    }

    if (customId === 'blacklist_admin_select') {
      if (!value) return interaction.reply({ content: 'Выберите действие.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      if (value === 'blacklist_admin_list') {
        const list = getBlacklist();
        if (!list.length) return interaction.reply({ content: 'Чёрный список пуст.', flags: MessageFlags.Ephemeral }).catch(()=>{});
        const summary = list.slice(0, 20).map((item) => `• <@${item.userId}> (${item.username}) — ${item.reason}`).join('\n');
        return interaction.reply({ content: `Чёрный список:\n${summary}`, flags: MessageFlags.Ephemeral }).catch(()=>{});
      }
      const modal = new ModalBuilder().setCustomId(value === 'blacklist_admin_add' ? 'admin_blacklist_add_modal' : 'admin_blacklist_remove_modal');
      if (value === 'blacklist_admin_add') {
        modal.setTitle('Добавить в чёрный список');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('blacklist_user').setLabel('User ID или @mention').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('blacklist_reason').setLabel('Причина').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
      } else {
        modal.setTitle('Убрать из чёрного списка');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('blacklist_user').setLabel('User ID или @mention').setStyle(TextInputStyle.Short).setRequired(true)));
      }
      interaction._handled = true;
      return interaction.showModal(modal).catch(async (err) => {
        logger.warn('Failed to show blacklist admin modal', { error: err.message });
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Не удалось открыть форму.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      });
    }
  },

  async handleButton(interaction) {
    if (!interaction.member) return;
    if (!hasAdminRole(interaction.member)) {
      return interaction.reply({ content: 'У вас нет прав для управления.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    if (interaction.customId.startsWith('admin_full_db_reset_cancel_')) {
      const owner = interaction.customId.replace('admin_full_db_reset_cancel_', '');
      if (owner !== interaction.user.id) return interaction.reply({ content: 'Это подтверждение принадлежит другому администратору.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      return interaction.update({ components: [require('../utils/messageBuilders').buildInfoMessage('Отмена', 'Полная очистка базы отменена.')], flags: MessageFlags.IsComponentsV2 }).catch(()=>{});
    }

    if (interaction.customId.startsWith('admin_full_db_reset_confirm_')) {
      if (!hasFullAdminRole(interaction.member)) {
        return interaction.reply({ content: 'Доступ запрещён.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      }
      const owner = interaction.customId.replace('admin_full_db_reset_confirm_', '');
      if (owner !== interaction.user.id) return interaction.reply({ content: 'Это подтверждение принадлежит другому администратору.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      clearAllRosterReminders();
      const tables = resetEntireDatabase();
      audit.log('admin', 'FULL DATABASE RESET', { by: interaction.user.id, tables, tableCount: tables.length });
      return interaction.update({ components: [require('../utils/messageBuilders').buildSuccessMessage('БАЗА ПОЛНОСТЬЮ ОЧИЩЕНА', `Удалены записи из **${tables.length}** таблиц. Схема БД сохранена.`)], flags: MessageFlags.IsComponentsV2 }).catch(()=>{});
    }

    if (interaction.customId === 'admin_reset_points_cancel') {
      return interaction.update({ components: [require('../utils/messageBuilders').buildInfoMessage('Отмена', 'Обнуление баллов отменено.')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    if (interaction.customId.startsWith('admin_reset_points_confirm_')) {
      if (!hasFullAdminRole(interaction.member)) {
        return interaction.reply({ content: 'Доступ запрещён.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      }
      const requesterId = interaction.customId.replace('admin_reset_points_confirm_', '');
      if (requesterId !== interaction.user.id) return interaction.reply({ content: 'Подтверждение принадлежит другому администратору.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const members = await interaction.guild.members.fetch();
      const benzoMembers = members.filter((m) => config.BENZO_ROLE_ID && m.roles.cache.has(config.BENZO_ROLE_ID));
      const count = resetAllPoints([...benzoMembers.keys()], interaction.user.id, 'Администратор обнулил баллы всем участникам BENZO');
      audit.log('points', 'Баллы всех BENZO обнулены', { by: interaction.user.id, count, eligibleMembers: benzoMembers.size });
      return interaction.update({ components: [require('../utils/messageBuilders').buildSuccessMessage('Баллы обнулены', `Обнулено участников: **${count}**. Активные voice-таймеры также сброшены.`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
    const id = interaction.customId;
    if (id === 'admin_toggle_tier_btn') {
      const current = getSetting('tier_open', '1') === '1';
      setSetting('tier_open', current ? '0' : '1');
      const newState = !current;
      audit.log('admin', 'Tier open toggled', { by: interaction.user.id, newState });
      return interaction.update({ content: `Приём заявок на TIER теперь **${newState ? 'ОТКРЫТ' : 'ЗАКРЫТ'}**.`, components: [] }).catch(() => {});
    }
  },

  async handleModal(interaction) {
    if (!interaction.member || !hasAdminRole(interaction.member)) {
      return interaction.reply({ content: 'У вас нет прав', flags: MessageFlags.Ephemeral }).catch(()=>{});
    }

    const cid = interaction.customId;
    if (cid === 'admin_roster_create_capt_modal' || cid === 'admin_roster_create_mcl_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const time = interaction.fields.getTextInputValue('roster_time').trim();
        const timeMatch = time.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);

        if (!timeMatch) {
          return interaction.editReply({
            content: 'Укажите время в формате ЧЧ:ММ, например **21:00**.',
          });
        }

        const type = cid === 'admin_roster_create_capt_modal' ? 'capt' : 'mcl';
        const channelId = config.CAPT_MCL_CHANNEL_ID || interaction.channelId;

        const createFn = type === 'capt' ? saveCaught : saveMCL;
        const getFn = type === 'capt' ? getCaughtList : getMCLList;
        const updateFn = type === 'capt' ? updateCaughtList : updateMCLList;

        const listId = createFn({
          channelId,
          time,
          createdBy: interaction.user.id,
          createdAt: Date.now(),
          main: [],
          subs: [],
          messageId: null,
        });

        const list = getFn(listId);
        const channel = await interaction.guild.channels
          .fetch(channelId)
          .catch(() => null);

        if (!channel) {
          return interaction.editReply({
            content: 'Канал CAPT/MCL не найден.',
          });
        }

        const { container } =
          await require('../utils/captMclPanel').buildCaptMclPanel(
            list,
            interaction.guild
          );

        const message = await channel.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });

        updateFn(listId, {
          messageId: message.id,
        });

        scheduleRosterReminder(
          interaction.client,
          {
            ...list,
            messageId: message.id,
            reminderSent: false,
            reminderDate: null,
          },
          type
        );

        await audit.log('admin', 'CAPT/MCL created', {
          type,
          listId,
          channelId,
          time,
          by: interaction.user.id,
        });

        return interaction.editReply({
          content:
            `${type.toUpperCase()} **${listId}** создан.\n` +
            `> Канал: <#${channelId}>\n` +
            `> Время: **${time}**`,
        });
      } catch (e) {
        logger.error('admin create capt/mcl modal error', {
          error: e.message,
          stack: e.stack,
        });

        await audit.log('error', 'Failed to create CAPT/MCL', {
          error: e.message,
          by: interaction.user.id,
        });

        return interaction.editReply({
          content: 'Не удалось создать CAPT/MCL.',
        });
      }
    }

    if (cid === 'admin_afk_add_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        let target = interaction.fields.getTextInputValue('afk_user').trim();
        if (target.startsWith('<@') && target.endsWith('>')) target = target.replace(/[<@!>]/g, '');
        const reason = interaction.fields.getTextInputValue('afk_reason') || null;
        setAFK(target, interaction.guild.id, reason);
        await utils.updateAFKPanelMessage(interaction.client, interaction.guild.id).catch(()=>{});
        audit.log('admin', 'AFK added manually', { by: interaction.user.id, user: target, reason });
        await interaction.editReply({ content: `Пользователь <@${target}> добавлен в AFK.` }).catch(()=>{});
      } catch (e) {
        logger.error('admin afk add modal error', { error: e.message });
        await interaction.editReply({ content: 'Не удалось добавить в AFK.' }).catch(()=>{});
      }
      return;
    }

    if (cid === 'admin_afk_remove_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        let target = interaction.fields.getTextInputValue('afk_user').trim();
        if (target.startsWith('<@') && target.endsWith('>')) target = target.replace(/[<@!>]/g, '');
        removeAFK(target, interaction.guild.id);
        await utils.updateAFKPanelMessage(interaction.client, interaction.guild.id).catch(()=>{});
        audit.log('admin', 'AFK removed manually', { by: interaction.user.id, user: target });
        await interaction.editReply({ content: `Пользователь <@${target}> удалён из AFK.` }).catch(()=>{});
      } catch (e) {
        logger.error('admin afk remove modal error', { error: e.message });
        await interaction.editReply({ content: 'Не удалось удалить из AFK.' }).catch(()=>{});
      }
      return;
    }

    if (cid === 'admin_cooldown_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        let target = interaction.fields.getTextInputValue('cooldown_user').trim();
        if (target.startsWith('<@') && target.endsWith('>')) target = target.replace(/[<@!>]/g, '');
        const daysInput = interaction.fields.getTextInputValue('cooldown_days').trim();
        const days = Number(daysInput);
        if (!Number.isInteger(days) || days < 0) {
          await interaction.editReply({ content: 'Укажите целое число дней.' }).catch(()=>{});
          return;
        }
        if (days === 0) {
          removeCooldown(target);
          audit.log('admin', 'Cooldown removed manually', { by: interaction.user.id, user: target });
          await interaction.editReply({ content: `Кулдаун для <@${target}> снят.` }).catch(()=>{});
        } else {
          setCooldown(target, Date.now() + days * 24 * 60 * 60 * 1000);
          audit.log('admin', 'Cooldown set manually', { by: interaction.user.id, user: target, days });
          await interaction.editReply({ content: `Кулдаун для <@${target}> установлен на ${days} ${days === 1 ? 'день' : 'дня'}.` }).catch(()=>{});
        }
      } catch (e) {
        logger.error('admin cooldown modal error', { error: e.message });
        await interaction.editReply({ content: 'Не удалось управить кулдауном.' }).catch(()=>{});
      }
      return;
    }

    if (cid.startsWith('admin_shop_')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const action = cid.replace('admin_', '').replace('_modal', '');
        if (action === 'shop_view_user') {
          let target = interaction.fields.getTextInputValue('shop_user').trim();
          target = normalizeUserId(target, interaction.guild) || target;
          const points = getPoints(target);
          await interaction.editReply({ content: `Баллы пользователя <@${target}>: **${points.toFixed(1)}**.` }).catch(()=>{});
          return;
        }
        if (action === 'shop_add_user' || action === 'shop_remove_user') {
          let target = interaction.fields.getTextInputValue('shop_user').trim();
          target = normalizeUserId(target, interaction.guild) || target;
          const amount = Number(interaction.fields.getTextInputValue('shop_amount').trim());
          if (!Number.isFinite(amount) || amount <= 0) {
            await interaction.editReply({ content: 'Укажите корректную сумму.' }).catch(()=>{});
            return;
          }
          if (action === 'shop_add_user') {
            addPoints(target, amount, { type: 'admin_add', reason: 'Ручное начисление администратором', performedBy: interaction.user.id });
            await interaction.editReply({ content: `Пользователю <@${target}> начислено **${amount}** баллов.` }).catch(()=>{});
          } else {
            const ok = removePoints(target, amount, { type: 'admin_remove', reason: 'Ручное списание администратором', performedBy: interaction.user.id });
            if (!ok) {
              await interaction.editReply({ content: `Не удалось списать баллы. Возможно, недостаточно или пользователь не найден.` }).catch(()=>{});
            } else {
              await interaction.editReply({ content: `У пользователя <@${target}> списано **${amount}** баллов.` }).catch(()=>{});
            }
          }
          audit.log('admin', 'Shop user points updated', { action, by: interaction.user.id, target, amount });
          return;
        }
        if (action === 'shop_add_role' || action === 'shop_remove_role') {
          const rawRole = interaction.fields.getTextInputValue('shop_role').trim();
          const roleId = normalizeRoleTarget(rawRole, interaction.guild);
          const amount = Number(interaction.fields.getTextInputValue('shop_amount').trim());
          if (!roleId) {
            await interaction.editReply({ content: 'Роль не найдена.' }).catch(()=>{});
            return;
          }
          if (!Number.isFinite(amount) || amount <= 0) {
            await interaction.editReply({ content: 'Укажите корректную сумму.' }).catch(()=>{});
            return;
          }
          const members = await interaction.guild.members.fetch();
          const ids = members.filter((m) => m.roles.cache.has(roleId)).map((m) => m.id);
          if (!ids.length) {
            await interaction.editReply({ content: 'У роли нет участников.' }).catch(()=>{});
            return;
          }
          if (action === 'shop_add_role') {
            bulkAddPoints(ids, amount, { type: 'admin_bulk_add', reason: `Начисление всем участникам роли ${roleId}`, performedBy: interaction.user.id });
            await interaction.editReply({ content: `Баллы **${amount}** выданы всем участникам роли <@&${roleId}>.` }).catch(()=>{});
          } else {
            bulkRemovePoints(ids, amount, { type: 'admin_bulk_remove', reason: `Списание у участников роли ${roleId}`, performedBy: interaction.user.id });
            await interaction.editReply({ content: `У всех участников роли <@&${roleId}> списано до **${amount}** баллов.` }).catch(()=>{});
          }
          audit.log('admin', 'Shop role points updated', { action, by: interaction.user.id, roleId, amount, count: ids.length });
          return;
        }
      } catch (e) {
        logger.error('admin shop modal error', { error: e.message, stack: e.stack });
        await interaction.editReply({ content: 'Не удалось выполнить действие магазина.' }).catch(()=>{});
      }
      return;
    }

    if (cid === 'admin_tier_request_modal' || cid === 'admin_tier_delete_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        let target = interaction.fields.getTextInputValue('tier_user').trim();
        if (target.startsWith('<@') && target.endsWith('>')) target = target.replace(/[<@!>]/g, '');
        if (!/^[0-9]+$/.test(target)) {
          await interaction.editReply({ content: 'Укажите корректный User ID или упоминание.' }).catch(()=>{});
          return;
        }
        const guild = interaction.guild;
        const member = await guild.members.fetch(target).catch(() => null);
        if (!member) {
          await interaction.editReply({ content: 'Пользователь не найден на сервере.' }).catch(()=>{});
          return;
        }

        if (cid === 'admin_tier_request_modal') {
          const existing = getOpenTierTicketByUser(target);
          if (existing) {
            await interaction.editReply({ content: 'У этого пользователя уже есть открытый запрос TIER.' }).catch(()=>{});
            return;
          }
        }

        if (cid === 'admin_tier_delete_modal') {
          const existing = getOpenTierTicketByUser(target);
          if (!existing) {
            await interaction.editReply({ content: 'Открытых запросов TIER для этого пользователя не найдено.' }).catch(()=>{});
            return;
          }
          deleteTierTicketByUser(target);
          if (existing.channelId) {
            const channel = await guild.channels.fetch(existing.channelId).catch(() => null);
            if (channel && channel.deletable) {
              await channel.delete(`Admin deleted tier request for ${member.user.tag}`).catch(()=>{});
            }
          }
          audit.log('admin', 'Tier request deleted', { by: interaction.user.id, target });
          await interaction.editReply({ content: `Запрос TIER для <@${target}> удалён.` }).catch(()=>{});
          return;
        }

        const note = interaction.fields.getTextInputValue('tier_note').trim() || null;
        if (!config.TIER_TICKET_CATEGORY_ID) {
          await interaction.editReply({ content: 'Категория тикетов TIER не настроена в config.' }).catch(()=>{});
          return;
        }

        const usernameSafe = member.user.username.toLowerCase().replace(/[^a-z0-9\-]/g, '-').slice(0, 90);
        const channelName = `${usernameSafe}-${target.slice(0, 5)}`;
        const everyone = guild.roles.everyone;
        const overwrites = [
          { id: everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: target, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        ];
        if (config.TIER_CHECKER_ROLE_ID) {
          overwrites.push({
            id: config.TIER_CHECKER_ROLE_ID,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageMessages,
            ],
          });
        }
        if (interaction.guild.members.me) {
          overwrites.push({
            id: interaction.guild.members.me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.ManageMessages,
            ],
          });
        }

        let parent;
        try { parent = await guild.channels.fetch(config.TIER_TICKET_CATEGORY_ID).catch(() => null); } catch (e) { parent = null; }

        const channel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: parent ? parent.id : undefined,
          permissionOverwrites: overwrites,
          reason: `Admin created Tier request for ${member.user.tag}`,
        });

        const id = createTierTicket(target, channel.id, [], null);
        audit.log('admin', 'Tier request created', { by: interaction.user.id, target, ticketId: id, channelId: channel.id, note });
        await interaction.editReply({ content: `Запрос TIER для <@${target}> создан: <#${channel.id}>.` }).catch(()=>{});
      } catch (e) {
        logger.error('admin tier modal error', { error: e.message, stack: e.stack });
        await interaction.editReply({ content: 'Не удалось выполнить действие TIER.' }).catch(()=>{});
      }
      return;
    }

    if (cid === 'admin_roster_add_modal' || cid === 'admin_roster_remove_modal' || cid === 'admin_roster_time_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const listId = interaction.fields.getTextInputValue('roster_list').trim();
        const rosterType = interaction.fields.getTextInputValue('roster_type').trim();
        const part = interaction.fields.getTextInputValue('roster_part').trim();
        let target = interaction.fields.getTextInputValue('roster_user').trim();
        if (target.startsWith('<@') && target.endsWith('>')) target = target.replace(/[<@!>]/g, '');

        const action = cid === 'admin_roster_time_modal' ? 'change' : cid === 'admin_roster_add_modal' ? 'add' : 'remove';

        if (action === 'change') {
          const newTime = interaction.fields.getTextInputValue('roster_time').trim();
          const timeMatch = newTime.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
          if (!timeMatch) {
            return interaction.editReply({ content: 'Укажите время в формате ЧЧ:ММ, например **21:00**.' }).catch(()=>{});
          }

          const list = rosterType === 'capt' ? getCaughtList(listId) : getMCLList(listId);
          if (!list) return interaction.editReply({ content: 'Список не найден.' }).catch(()=>{});

          const updateFn = rosterType === 'capt' ? updateCaughtList : updateMCLList;
          updateFn(listId, { time: newTime });
          audit.log('admin', 'Roster time changed', { listId, type: rosterType, newTime, by: interaction.user.id });
          return interaction.editReply({ content: `Время списка **${listId}** изменено на **${newTime}**.` }).catch(()=>{});
        }

        if (part !== 'main' && part !== 'subs') {
          return interaction.editReply({ content: 'Укажите main или subs.' }).catch(()=>{});
        }

        const list = rosterType === 'capt' ? getCaughtList(listId) : getMCLList(listId);
        if (!list) return interaction.editReply({ content: 'Список не найден.' }).catch(()=>{});

        const updateFn = rosterType === 'capt' ? updateCaughtList : updateMCLList;
        const current = list[part] ? JSON.parse(list[part]) : [];

        if (action === 'add') {
          if (current.includes(target)) {
            return interaction.editReply({ content: 'Участник уже в списке.' }).catch(()=>{});
          }
          current.push(target);
          updateFn(listId, { [part]: JSON.stringify(current) });
          audit.log('admin', 'Roster member added', { listId, type: rosterType, part, target, by: interaction.user.id });
          return interaction.editReply({ content: `Участник <@${target}> добавлен в ${part} списка **${listId}**.` }).catch(()=>{});
        } else {
          const idx = current.indexOf(target);
          if (idx === -1) {
            return interaction.editReply({ content: 'Участник не найден в списке.' }).catch(()=>{});
          }
          current.splice(idx, 1);
          updateFn(listId, { [part]: JSON.stringify(current) });
          audit.log('admin', 'Roster member removed', { listId, type: rosterType, part, target, by: interaction.user.id });
          return interaction.editReply({ content: `Участник <@${target}> удалён из ${part} списка **${listId}**.` }).catch(()=>{});
        }
      } catch (e) {
        logger.error('admin roster modal error', { error: e.message, stack: e.stack });
        await interaction.editReply({ content: 'Не удалось выполнить действие со списком.' }).catch(()=>{});
      }
      return;
    }

    if (cid === 'admin_blacklist_add_modal' || cid === 'admin_blacklist_remove_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        let target = interaction.fields.getTextInputValue('blacklist_user').trim();
        target = normalizeUserId(target, interaction.guild) || target;
        if (cid === 'admin_blacklist_add_modal') {
          const reason = interaction.fields.getTextInputValue('blacklist_reason').trim() || 'Не указана причина';
          const user = await interaction.client.users.fetch(target).catch(()=>null);
          addToBlacklist(target, user?.tag || target, reason, interaction.user.id);
          await interaction.editReply({ content: `Пользователь <@${target}> добавлен в чёрный список.` }).catch(()=>{});
          audit.log('admin', 'Blacklist add', { by: interaction.user.id, target, reason });
          return;
        }
        removeFromBlacklist(target);
        await interaction.editReply({ content: `Пользователь <@${target}> удалён из чёрного списка.` }).catch(()=>{});
        audit.log('admin', 'Blacklist remove', { by: interaction.user.id, target });
      } catch (e) {
        logger.error('admin blacklist modal error', { error: e.message, stack: e.stack });
        await interaction.editReply({ content: 'Не удалось управить чёрным списком.' }).catch(()=>{});
      }
      return;
    }
  },

  restoreRosterReminders: async function (client) {
    try {
      clearAllRosterReminders();
      const captLists = getAllCaughtLists();
      const mclLists = getAllMCLLists();
      for (const list of captLists) scheduleRosterFromSummary(client, list, 'capt');
      for (const list of mclLists) scheduleRosterFromSummary(client, list, 'mcl');
      audit.log('admin', 'Roster reminders restored', { capt: captLists.length, mcl: mclLists.length });
    } catch (e) {
      logger.error('restoreRosterReminders failed', { error: e.message, stack: e.stack });
      audit.log('error', 'restoreRosterReminders failed', { error: e.message, stack: e.stack });
    }
  },

  _sendRosterReminderForManual: async function(client, list, type) {
    return sendRosterReminder(client, list, type, false);
  },

  _sendCombinedRosterReminders: async function(client, lists) {
    return sendCombinedRosterReminders(client, lists);
  },
};
