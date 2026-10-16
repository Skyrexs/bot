const { addBanner } = require('../utils/banner');
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  StringSelectMenuBuilder,
  LabelBuilder,
} = require('discord.js');

const config = require('../config');
const db = require('../database');
const { createPointsRequest, updatePointsRequest } = db;
const utils = require('../utils');
const audit = utils.audit;
const logger = require('../logger');


const EARN_POINTS_REASON_OPTIONS = [
  { value: 'ceha', label: 'Цеха / Диллеры' },
  { value: 'drop', label: 'Drop' },
  { value: 'ostrov', label: 'ФЗ / Остров' },
  { value: 'postavka', label: 'Поставка / Крафт' },
  { value: 'bank', label: 'Ограбление банка' },
  { value: 'bizak', label: 'Ограбление бизнеса' },
  { value: 'contact', label: 'Семейный контракт' },
  { value: 'captt', label: 'Капт' },
  { value: 'mcll', label: 'MCL / ВЗЗ' },
];

const SPEND_POINTS_REASON_OPTIONS = [
  { value: 'academ', label: 'Повышение на Academ' },
  { value: 'main', label: 'Повышение на Main' },
  { value: 'warn', label: 'Снятие WARN' },
  { value: 'rolee', label: 'Роль 812' },
  { value: 'roleeee', label: 'Роль OG' },
  { value: 'other', label: 'Секретный предмет' },
];

const getReasonOptions = (type) =>
  type === 'earn' ? EARN_POINTS_REASON_OPTIONS : SPEND_POINTS_REASON_OPTIONS;

const getReasonLabel = (value) => {
  const option = [...EARN_POINTS_REASON_OPTIONS, ...SPEND_POINTS_REASON_OPTIONS].find((o) => o.value === value);
  return option ? option.label : value;
};

function buildPointsModal(type) {
  const reasonSelect = new StringSelectMenuBuilder()
    .setCustomId('p_reason_select')
    .setPlaceholder('Выберите причину')
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true)
    .addOptions(
      getReasonOptions(type).map((option) => ({
        label: option.label,
        value: option.value,
      }))
    );

  return new ModalBuilder()
    .setCustomId(`points_form_${type}`)
    .setTitle(
      type === 'earn'
        ? 'Запрос на получение баллов'
        : 'Запрос на списание баллов'
    )

    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Ваши Имя Фамилия и Статик')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('p_name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
            .setPlaceholder('Пример: Wex Benzo | 1337')
        ),

      new LabelBuilder()
        .setLabel('Причина')
        .setStringSelectMenuComponent(reasonSelect),

      new LabelBuilder()
        .setLabel('Доказательства')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('p_proof')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
            .setPlaceholder('Ссылки на скриншоты или видео')
        )
    );
}

module.exports = {
  buttonIds: [
    'shop_get_btn',
    'shop_spend_btn',
    'shop_rating_btn',
  ],

  selectIds: [],

  modalPrefixes: ['points_form_'],

  async handleButton(interaction) {
    const id = interaction.customId;

    if (id === 'shop_get_btn' || id === 'shop_spend_btn') {
      const type =
        id === 'shop_get_btn'
          ? 'earn'
          : 'spend';

      interaction._handled = true;

      return interaction
        .showModal(buildPointsModal(type))
        .catch(async (err) => {
          logger.error('shop showModal error', {
            error: err.message,
            stack: err.stack,
          });

          if (!interaction.replied && !interaction.deferred) {
            await interaction
              .reply({
                content: 'Не удалось открыть форму.',
                flags: MessageFlags.Ephemeral,
              })
              .catch(() => {});
          }
        });
    }

    if (id === 'shop_rating_btn') {
      try {
        const result = await utils.buildRatingContainer(interaction.guild);

        if (result && result.container) {
          return interaction
            .reply({
              components: [result.container],
              flags:
                MessageFlags.IsComponentsV2 |
                MessageFlags.Ephemeral,
            })
            .catch(() => {});
        }
      } catch (e) {
        logger.warn('Failed to show rating', {
          error: e.message,
        });

        return interaction
          .reply({
            content: 'Не удалось получить рейтинг',
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }
    }
  },

  async handleSelect(interaction) {
    const customId = interaction.customId;

    if (!customId.startsWith('points_reason_select_')) {
      return;
    }

    return interaction
      .reply({
        content:
          'Этот выбор должен выполняться внутри формы заявки.',
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  },

  async handleModal(interaction) {
    const cid = interaction.customId;

    if (!cid.startsWith('points_form_')) {
      return;
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const type = cid.replace('points_form_', '');

      const name =
        interaction.fields.getTextInputValue('p_name');

      const details =
        interaction.fields.getTextInputValue('p_details');

      const proof =
        interaction.fields.getTextInputValue('p_proof') || null;

      const selectedReason =
        interaction.fields
          .getStringSelectValues('p_reason_select')?.[0];

      const reason = selectedReason
        ? getReasonLabel(selectedReason)
        : 'Другая причина';

      const reviewCh =
        await interaction.guild.channels
          .fetch(
            config.SHOP_REVIEW_CHANNEL_ID ||
              config.REVIEW_CHANNEL_ID
          )
          .catch(() => null);

      if (!reviewCh) {
        return interaction.editReply({
          content: 'Канал для рассмотрения заявок не настроен.',
        }).catch(() => {});
      }

      const id = createPointsRequest({
        userId: interaction.user.id,
        type: type === 'spend' ? 'spend' : 'earn',
        reasonType: reason,
        name,
        proof,
        details,
        amount: null,
        messageId: null,
      });

      const container = new ContainerBuilder().setAccentColor(0x000000);
      addBanner(container);

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## НОВАЯ ЗАЯВКА НА ${
            type === 'earn' ? 'ПОЛУЧЕНИЕ' : 'СПИСАНИЕ'
          } БАЛЛОВ`
        )
      );

      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Large)
          .setDivider(true)
      );

      if (config.HIGH_STAFF_ROLE_ID) {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`<@&${config.HIGH_STAFF_ROLE_ID}>`)
        );
      }

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### <:754816forreal:1470442212020981963> Заявитель
` +
          `> **Пользователь:** <@${interaction.user.id}> (\`${interaction.user.tag}\`)
` +
          `> **ID:** \`${interaction.user.id}\`
` +
          `> **Имя / статик:** ${name}

` +
          `### <a:dddd:1507119555166601318> Запрос
` +
          `> **Операция:** ${type === 'earn' ? 'Получение' : 'Списание'}
` +
          `> **Причина:** ${reason}

` +
          `### <a:3342emoshit:1507119849971650583> Детали
${details}

` +
          `### <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151> Доказательства
${proof || '—'}`
        )
      );

      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Small)
          .setDivider(true)
      );

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`points_accept_${id}`)
            .setLabel('Принять и указать баллы')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`points_reject_${id}`)
            .setLabel('Отклонить')
            .setStyle(ButtonStyle.Danger)
        )
      );

      const sent = await reviewCh.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      }).catch((e) => {
        logger.warn('Failed to send points request to review', {
          error: e?.message,
        });
        return null;
      });

      if (!sent) {
        updatePointsRequest(id, {
          status: 'rejected',
          reviewerId: null,
          handledAt: Date.now(),
        });
        return interaction.editReply({
          content: 'Не удалось отправить заявку на рассмотрение. Попробуйте ещё раз.',
        }).catch(() => {});
      }

      updatePointsRequest(id, { messageId: sent.id });

      audit.log(
        'points',
        'New points request created',
        {
          id,
          user: interaction.user.id,
          type,
          reason,
        }
      );

      return interaction
        .editReply({
          content:
            'Заявка отправлена на рассмотрение.',
        })
        .catch(() => {});
    } catch (e) {
      logger.error(
        'points_form modal error',
        {
          error: e.message,
          stack: e.stack,
        }
      );

      audit.log(
        'error',
        'points_form modal error',
        {
          error: e.message,
        }
      );

      return interaction
        .editReply({
          content:
            'Не удалось отправить заявку.',
        })
        .catch(() => {});
    }
  },
};