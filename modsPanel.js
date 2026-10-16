const {
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require('discord.js');
const { addBanner } = require('./banner');
const { E } = require('./messageBuilders');
const { isModsOpen } = require('../database');


const MOD_ITEMS = [
  {
    value: 'redux_v1',
    label: 'BENZO REDUX v1',
    description: 'Таймциклы, прицел, броня, рюкзак, ганпаки',
    emoji: { id: '1509712665445007566', animated: true },
    build: () => {
      const c = new ContainerBuilder().setAccentColor(0x000000);
      addBanner(c);

      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${E.fire} ОСНОВНЫЕ ФАЙЛЫ REDUX ${E.fire}`)
      );

      c.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
      );

      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${E.arrow} На Google Диске вы найдёте следующие файлы:\n\n` +
          `${E.success} Основные файлы редукса — файл \`update.rpf\`\n` +
          `${E.success} Удалялки из редукса — OIV автоустановщики, чтобы быстро вернуть всё как было, без ручной возни\n` +
          `${E.success} Расположение миникарты по центру для разрешений 16:9 и 1:1 / 5:4\n` +
          `${E.success} Эксклюзивный зелёный Sandy Shores\n` +
          `${E.success} Сборка всех наших ганпаков`
        )
      );

      c.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
      );

      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${E.spin} Замена таймциклов\n` +
          `Хочешь использовать свои таймциклы? Открывай \`update.rpf\` через OpenIV и заменяй файл тут:\n` +
          `\`update.rpf\\common\\data\\timecycle\`\n\n` +
          `### ${E.warning} Замена прицела\n` +
          `Хочешь поставить свой прицел? Открывай \`update.rpf\` через OpenIV и заменяй файл тут:\n` +
          `\`update.rpf\\gucci_scope.rpf\\hud_reticle.gfx\`\n\n` +
          `### ${E.user} Замена бронежилета\n` +
          `Хочешь заменить бронежилет? Открывай \`update.rpf\` через OpenIV и заменяй файлы тут:\n` +
          `\`update.rpf\\gucci_armour.rpf\`\n\n` +
          `### ${E.plus} Замена рюкзака\n` +
          `Хочешь заменить рюкзак? Открывай \`update.rpf\` через OpenIV и заменяй файл тут:\n` +
          `\`update.rpf\\gucci_backpack.rpf\``
        )
      );

      c.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
      );

      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# Если вдруг появятся баги — просто напишите, и мы быстро всё поправим и зальём фикс.`
        )
      );

      const linkRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Google Диск')
          .setStyle(ButtonStyle.Link)
          .setURL('https://drive.google.com/REPLACE_ME')
          .setEmoji({ id: '1509629783317676124' }),
        new ButtonBuilder()
          .setLabel('Видео обзор')
          .setStyle(ButtonStyle.Link)
          .setURL('https://youtube.com/REPLACE_ME')
          .setEmoji({ id: '1507120971453173760', animated: true })
      );
      c.addActionRowComponents(linkRow);

      return c;
    },
  },

  {
    value: 'gunpack_v1',
    label: 'BENZO Gunpack',
    description: 'Кастомные скины оружия семьи',
    emoji: { id: '1507119849971650583', animated: true },
    build: () => {
      const c = new ContainerBuilder().setAccentColor(0x000000);
      addBanner(c);

      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${E.fire} BENZO GUNPACK ${E.fire}`)
      );

      c.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
      );

      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${E.arrow} Заготовка карточки — впишите сюда описание и состав ганпака.\n\n` +
          `${E.success} Пример пункта 1\n` +
          `${E.success} Пример пункта 2`
        )
      );

      c.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
      );

      const linkRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Google Диск')
          .setStyle(ButtonStyle.Link)
          .setURL('https://drive.google.com/REPLACE_ME')
          .setEmoji({ id: '1509629783317676124' })
      );
      c.addActionRowComponents(linkRow);

      return c;
    },
  },
  {
    value: 'faq_mods',
    label: 'FAQ по модам',
    description: 'Частые вопросы по установке',
    emoji: { id: '1509630676603764737' },
    build: () => {
      const c = new ContainerBuilder().setAccentColor(0x000000);
      addBanner(c);

      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${E.info} FAQ ПО МОДАМ ${E.info}`)
      );

      c.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
      );

      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### Не открывается update.rpf?\n*Впишите сюда ответ*\n\n` +
          `### Что делать, если появился баг?\n*Впишите сюда ответ*`
        )
      );

      return c;
    },
  },
];

function buildModsPanelMessage() {
  const open = isModsOpen();
  const container = new ContainerBuilder().setAccentColor(0x000000);
  addBanner(container);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${E.fire} BENZO MODS | REDUX & GUNPACK ${E.fire}`)
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${E.arrow} Уникальный Redux - наша семейная разработка от лучших модмейкеров в GTA 5!\n\n` +
      `${E.arrow} Богатый выбор Gunpack для ценителей стиля и индивидуальности.\n\n` +
      `${E.info} Встроенные скрипты для OpenIV - с их помощью вы легко сможете установить / удалить любые ненужные модификации всего за 2 клика.\n\n` +
      `${E.warning} *Redux прошёл проверку у администрации сервера на отсутствие запрещенных функций.*\n` +
      `${E.warning} Если вдруг появятся баги - просто напишите, и мы быстро всё поправим!`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# BENZO • Моды и редуксы семьи`)
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId('mods_panel_select')
    .setPlaceholder(open ? 'Выберите нужное' : 'Моды в доработке')
    .setDisabled(!open)
    .addOptions(
      MOD_ITEMS.map(item => {
        const opt = new StringSelectMenuOptionBuilder()
          .setLabel(item.label)
          .setDescription(item.description)
          .setValue(item.value);
        if (item.emoji) opt.setEmoji(item.emoji);
        return opt;
      })
    );

  container.addActionRowComponents(new ActionRowBuilder().addComponents(select));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

function getModItem(value) {
  return MOD_ITEMS.find(i => i.value === value) || null;
}

module.exports = { buildModsPanelMessage, getModItem, MOD_ITEMS };