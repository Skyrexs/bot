const { MessageFlags } = require('discord.js');
const config = require('../config');
const db = require('../database');
const logger = require('../logger');
const utils = require('../utils');
const audit = utils.audit;

module.exports = {
  buttonPrefixes: [
    'captmcl_main_',
    'captmcl_sub_',
    'captmcl_leave_',
    'captmcl_to_main_',
    'captmcl_to_sub_',
  ],

  async handleButton(interaction) {
    const id = interaction.customId;
    const isMain = id.startsWith('captmcl_main_');
    const isSub = id.startsWith('captmcl_sub_');
    const isLeave = id.startsWith('captmcl_leave_');
    const isToMain = id.startsWith('captmcl_to_main_');
    const isToSub = id.startsWith('captmcl_to_sub_');

    if (!isMain && !isSub && !isLeave && !isToMain && !isToSub) return;

    const listId = id.replace(
      /^captmcl_(?:main|sub|leave|to_main|to_sub)_/,
      ''
    );

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const isMcl = listId.startsWith('mcl_');
      const getList = isMcl ? db.getMCLList : db.getCaughtList;
      const updateList = isMcl ? db.updateMCLList : db.updateCaughtList;

      const list = getList(listId);
      if (!list) {
        return interaction.editReply({ content: 'CAPT/MCL не найден.' });
      }

      const member = interaction.member;
      if (!member) {
        return interaction.editReply({
          content: 'Не удалось определить участника.',
        });
      }

      const benzoRoleId = config.BENZO_ROLE_ID;
      if (!benzoRoleId || !member.roles?.cache?.has(benzoRoleId)) {
        return interaction.editReply({
          content: 'Участие в CAPT/MCL доступно только участникам с ролью BENZO.',
        });
      }

      const currentMain = list.main.includes(member.id);
      const currentSub = list.subs.includes(member.id);

      const wantsMain = isMain || isToMain;
      const wantsSub = isSub || isToSub;

      if (isLeave) {
        if (!currentMain && !currentSub) {
          return interaction.editReply({
            content: 'Вы не записаны на этот список.',
          });
        }

        const main = list.main.filter(
          (userId) => userId !== member.id
        );
        const subs = list.subs.filter(
          (userId) => userId !== member.id
        );

        updateList(listId, { main, subs });

        await interaction.editReply({
          content: 'Вы вышли из списка.',
        });

        await updateRosterMessage(interaction, listId);

        await audit.log('captmcl', 'Пользователь вышел из списка', {
          listId,
          userId: member.id,
        });

        return;
      }

      if (wantsSub) {
        if (currentSub) {
          return interaction.editReply({
            content: 'Вы уже находитесь в замене.',
          });
        }

        if (currentMain) {
          if (list.subs.length >= config.SUBS_ROSTER_LIMIT) {
            return interaction.editReply({
              content: 'Замена заполнена.',
            });
          }

          updateList(listId, {
            main: list.main.filter(
              (userId) => userId !== member.id
            ),
            subs: [...list.subs, member.id],
          });

          await interaction.editReply({
            content: 'Вы переведены из основы в замену.',
          });

          await updateRosterMessage(interaction, listId);

          await audit.log(
            'captmcl',
            'Пользователь переведён из основы в замену',
            {
              listId,
              userId: member.id,
            }
          );

          return;
        }

        if (list.subs.length >= config.SUBS_ROSTER_LIMIT) {
          return interaction.editReply({
            content: 'Все места в замене заняты.',
          });
        }

        updateList(listId, {
          subs: [...list.subs, member.id],
        });

        await interaction.editReply({
          content: 'Вы добавлены в замену.',
        });

        await updateRosterMessage(interaction, listId);

        await audit.log(
          'captmcl',
          'Пользователь добавлен в замену',
          {
            listId,
            userId: member.id,
          }
        );

        return;
      }

      if (wantsMain) {
        if (currentMain) {
          return interaction.editReply({
            content: 'Вы уже находитесь в основе.',
          });
        }

        const newPriority = getTierPriority(member);

        if (list.main.length < config.MAIN_ROSTER_LIMIT) {
          updateList(listId, {
            main: [...list.main, member.id],
            subs: list.subs.filter(
              (userId) => userId !== member.id
            ),
          });

          await interaction.editReply({
            content: currentSub
              ? 'Вы переведены из замены в основу.'
              : 'Вы добавлены в основу.',
          });

          await updateRosterMessage(interaction, listId);

          await audit.log(
            'captmcl',
            currentSub
              ? 'Пользователь переведён из замены в основу'
              : 'Пользователь добавлен в основу',
            {
              listId,
              userId: member.id,
              priority: newPriority,
            }
          );

          return;
        }

        const mainMembers = await getMembersWithPriority(
          list.main,
          interaction.guild
        );

        if (!mainMembers.length) {
          return interaction.editReply({
            content:
              'Не удалось определить участников основы. Попробуйте ещё раз.',
          });
        }

        const lowest = mainMembers.reduce((a, b) =>
          a.priority >= b.priority ? a : b
        );

        if (newPriority >= lowest.priority) {
          return interaction.editReply({
            content:
              'Основа заполнена участниками с таким же или более высоким приоритетом. Вы можете остаться в замене.',
          });
        }

        if (
          !currentSub &&
          list.subs.length >= config.SUBS_ROSTER_LIMIT
        ) {
          return interaction.editReply({
            content:
              'Основа заполнена, а замена тоже полностью занята — заменить участника сейчас невозможно.',
          });
        }

        const newMain = list.main.filter(
          (userId) => userId !== lowest.userId
        );

        const newSubs = list.subs.filter(
          (userId) => userId !== member.id
        );

        newSubs.push(lowest.userId);

        updateList(listId, {
          main: [...newMain, member.id],
          subs: newSubs,
        });

        await interaction.editReply({
          content:
            `<@${member.id}> занял место в основе. ` +
            `<@${lowest.userId}> перемещён в замену.`,
        });

        await updateRosterMessage(interaction, listId);

        await audit.log(
          'captmcl',
          'Произошла замена участника основы',
          {
            listId,
            promotedUserId: member.id,
            movedToSubUserId: lowest.userId,
            newPriority,
            displacedPriority: lowest.priority,
          }
        );

        return;
      }
    } catch (e) {
      logger.error('captmcl handler error', {
        error: e.message,
        stack: e.stack,
      });

      await audit.log('error', 'CAPT/MCL handler failed', {
        error: e.message,
        customId: interaction.customId,
      });

      await interaction
        .editReply({
          content: 'Произошла ошибка при обработке списка.',
        })
        .catch(() => {});
    }
  },
};

function getTierPriority(member) {
  if (!member) return 4;

  if (
    config.TIER_ROLES?.TIER_1 &&
    member.roles.cache.has(config.TIER_ROLES.TIER_1)
  ) {
    return 1;
  }

  if (
    config.TIER_ROLES?.TIER_2 &&
    member.roles.cache.has(config.TIER_ROLES.TIER_2)
  ) {
    return 2;
  }

  if (
    config.TIER_ROLES?.TIER_3 &&
    member.roles.cache.has(config.TIER_ROLES.TIER_3)
  ) {
    return 3;
  }

  return 4;
}

async function getMembersWithPriority(userIds, guild) {
  const members = [];

  for (const userId of userIds) {
    const member = await guild.members
      .fetch(userId)
      .catch(() => null);

    if (member) {
      members.push({
        userId,
        priority: getTierPriority(member),
      });
    }
  }

  return members;
}

async function updateRosterMessage(interaction, listId) {
  try {
    const isMcl = listId.startsWith('mcl_');

    const list = isMcl
      ? db.getMCLList(listId)
      : db.getCaughtList(listId);

    if (!list?.messageId) return;

    const channel = await interaction.guild.channels
      .fetch(list.channelId)
      .catch(() => null);

    if (!channel) return;

    const message = await channel.messages
      .fetch(list.messageId)
      .catch(() => null);

    if (!message) return;

    const { container } =
      await require('../utils/captMclPanel').buildCaptMclPanel(
        list,
        interaction.guild
      );

    await message.edit({
      components: [container],
    });
  } catch (e) {
    logger.warn('Failed to update CAPT/MCL message', {
      error: e.message,
    });
  }
}
