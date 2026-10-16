const {
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require('discord.js');
const { addBanner } = require('../utils/banner');
const logger = require('../logger');
const { hasModeratorAccess } = require('../utils/permissions');

function hasAdminRole(member) {
  return hasModeratorAccess(member);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Панель администратора')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      if (!hasAdminRole(interaction.member)) {
        const errContainer = new ContainerBuilder().setAccentColor(0xFF0000);
        addBanner(errContainer);
        errContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## Нет доступа!\nУ вас недостаточно прав для открытия панели администратора.`)
        );
        return await interaction.reply({
          components: [errContainer],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }

      const container = new ContainerBuilder().setAccentColor(0x000000);

      addBanner(container);

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ПАНЕЛЬ АДМИНИСТРАТОРА BENZO`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Выберите действие в меню ниже.`
        )
      );

      const mainMenu = new StringSelectMenuBuilder()
        .setCustomId('admin_panel_select')
        .setPlaceholder('Выберите действие')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Создать CAPT').setValue('create_capt').setEmoji({ id: '1507121377088639119' }),
          new StringSelectMenuOptionBuilder().setLabel('Создать MCL').setValue('create_mcl').setEmoji({ id: '1507120177173627051' }),
          new StringSelectMenuOptionBuilder().setLabel('Магазин - управление').setValue('shop_admin_menu').setEmoji({ id: '1507120263777489017', animated: true }),
          new StringSelectMenuOptionBuilder().setLabel('Склад - управление').setValue('warehouse_admin_menu').setEmoji({ id: '1507120971453173760' }),
          new StringSelectMenuOptionBuilder().setLabel('TIER - управление').setValue('tier_admin_menu').setEmoji({ id: '1509629783317676124' }),
          new StringSelectMenuOptionBuilder().setLabel('CAPT / MCL - управление').setValue('roster_menu').setEmoji({ id: '1470446427451687003' }),
          new StringSelectMenuOptionBuilder().setLabel('Чёрный список').setValue('blacklist_menu').setEmoji({ id: '1509630676603764737' }),
          new StringSelectMenuOptionBuilder().setLabel('AFK - управление').setValue('afk_menu').setEmoji({ id: '1507120899340636240' }),
          new StringSelectMenuOptionBuilder().setLabel('Кулдаун - управление').setValue('cooldown_menu').setEmoji({ id: '1507119775325618287' }),
          new StringSelectMenuOptionBuilder().setLabel('Состояние бота').setValue('command_health').setEmoji({ id: '1470449604414935261' }),
          new StringSelectMenuOptionBuilder().setLabel('Создать резервную копию БД').setValue('command_backup').setEmoji({ id: '1509712665445007566' }),
          new StringSelectMenuOptionBuilder().setLabel('ПОЛНОСТЬЮ ОЧИСТИТЬ БАЗУ ДАННЫХ').setValue('database_reset').setEmoji({ id: '1509630676603764737' })
        );

      container.addActionRowComponents(new ActionRowBuilder().addComponents(mainMenu));

      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });

      logger.info('Админ-панель открыта', { user: interaction.user.username });

    } catch (error) {
      logger.error('Ошибка /admin', { error: error.message });
      const errContainer = new ContainerBuilder().setAccentColor(0xFF0000);
      addBanner(errContainer);
      errContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Ошибка\n${error.message}`)
      );
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  }
};