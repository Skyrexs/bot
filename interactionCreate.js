const { Events, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const utils = require('../utils');
const audit = utils.audit;

const handlers = [];
const interactionLocks = new Map();
const INTERACTION_LOCK_MS = 2500;

function isInvalidInteractionError(error) {
  if (!error) return false;
  if (error.code === 10062) return true;
  const message = String(error.message || '');
  return /unknown interaction/i.test(message) || /interaction has already been acknowledged/i.test(message);
}

function tryAcquireInteractionLock(interaction) {
  const userId = interaction.user?.id || 'unknown';
  const customId = interaction.customId || interaction.commandName || 'unknown';
  const key = `${userId}:${customId}`;
  const now = Date.now();
  const existing = interactionLocks.get(key);
  if (existing && existing > now) return false;
  interactionLocks.set(key, now + INTERACTION_LOCK_MS);
  setTimeout(() => {
    if (interactionLocks.get(key) <= Date.now()) interactionLocks.delete(key);
  }, INTERACTION_LOCK_MS + 250);
  return true;
}

const handlersDir = path.join(__dirname, '..', 'handlers');

if (fs.existsSync(handlersDir)) {
  for (const file of fs.readdirSync(handlersDir).filter((f) => f.endsWith('.js'))) {
    try {
      const mod = require(path.join(handlersDir, file));
      handlers.push(mod);
      logger.info(`Loaded handler: ${file}`);
    } catch (e) {
      logger.error(`Failed loading handler ${file}`, {
        error: e.message,
        stack: e.stack,
      });
    }
  }
}

const isHandled = (interaction) =>
  interaction.replied || interaction.deferred || interaction._handled || interaction.isAcknowledged?.();

async function safeError(interaction, message = 'Произошла ошибка при обработке действия.') {
  try {
    if (interaction.isAcknowledged?.()) {
      return;
    }

    if (!isHandled(interaction)) {
      return await interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (err) {
    if (isInvalidInteractionError(err)) return;
  }
}

async function dispatch(interaction, type, id, methodName, exactKey, prefixKeys = []) {
  for (const handler of handlers) {
    const exact = Array.isArray(handler[exactKey]) && handler[exactKey].includes(id);
    const prefix = Array.isArray(handler[prefixKeys[0]]) &&
      handler[prefixKeys[0]].some((p) => id.startsWith(p));

    if (!exact && !prefix) continue;
    if (typeof handler[methodName] !== 'function') continue;

    try {
      const result = await handler[methodName](interaction);
      return { handled: true, result, handler };
    } catch (err) {
      if (isInvalidInteractionError(err)) {
        logger.warn(`${type} handler ignored invalid interaction`, {
          customId: id,
          error: err.message,
          stack: err.stack,
          userId: interaction.user?.id,
        });
        return { handled: true, error: err };
      }
      logger.error(`${type} handler failed`, {
        customId: id,
        error: err.message,
        stack: err.stack,
      });
      await audit.log('error', `${type} handler failed`, {
        customId: id,
        error: err.message,
        userId: interaction.user?.id,
      });
      await safeError(interaction);
      return { handled: true, error: err };
    }
  }

  return { handled: false };
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    try {
      const info = {
        userId: interaction.user?.id,
        username: interaction.user?.tag,
        guildId: interaction.guild?.id || null,
        channelId: interaction.channel?.id || null,
        type: interaction.type,
        commandName: interaction.isChatInputCommand?.() ? interaction.commandName : undefined,
        customId:
          interaction.isButton?.() ||
          interaction.isStringSelectMenu?.() ||
          interaction.isModalSubmit?.()
            ? interaction.customId
            : undefined,
        values: interaction.isStringSelectMenu?.() ? interaction.values : undefined,
        timestamp: Date.now(),
      };

      // Every interaction is written to the configured audit channel.
      if (interaction.isChatInputCommand?.()) {
        audit.log('interaction', 'Получено взаимодействие', info).catch(() => {});
      }

      if (interaction.isChatInputCommand?.()) {
        const commandName = interaction.commandName;

        for (const handler of handlers) {
          if (
            Array.isArray(handler.commandNames) &&
            handler.commandNames.includes(commandName) &&
            typeof handler.handleCommand === 'function'
          ) {
            return await handler.handleCommand(interaction);
          }
        }

        const command = interaction.client.commands.get(commandName);
        if (!command) {
          return safeError(interaction, 'Команда не найдена.');
        }

        try {
          await command.execute(interaction);
          await audit.log('command', `Выполнена /${commandName}`, {
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
          });
        } catch (err) {
          logger.error(`Ошибка /${commandName}`, {
            error: err.message,
            stack: err.stack,
          });
          await audit.log('error', `Ошибка /${commandName}`, {
            error: err.message,
            userId: interaction.user.id,
          });
          await safeError(interaction, 'Произошла ошибка при выполнении команды.');
        }
        return;
      }

      if (interaction.isButton?.()) {
        if (!tryAcquireInteractionLock(interaction)) {
          return safeError(interaction, 'Действие уже обрабатывается. Подождите пару секунд.');
        }
        const result = await dispatch(
          interaction,
          'button',
          interaction.customId,
          'handleButton',
          'buttonIds',
          ['buttonPrefixes']
        );
        if (!result.handled && !isHandled(interaction)) {
          await safeError(interaction, 'Эта кнопка больше не активна.');
        }
        return;
      }

      if (interaction.isStringSelectMenu?.()) {
        if (!tryAcquireInteractionLock(interaction)) {
          return safeError(interaction, 'Действие уже обрабатывается. Подождите пару секунд.');
        }
        const result = await dispatch(
          interaction,
          'select',
          interaction.customId,
          'handleSelect',
          'selectIds',
          ['selectPrefixes']
        );
        if (!result.handled && !isHandled(interaction)) {
          await safeError(interaction, 'Это меню больше не активно.');
        }
        return;
      }

      if (interaction.isModalSubmit?.()) {
        if (!tryAcquireInteractionLock(interaction)) {
          return safeError(interaction, 'Форма уже обрабатывается. Подождите пару секунд.');
        }
        const result = await dispatch(
          interaction,
          'modal',
          interaction.customId,
          'handleModal',
          'modalIds',
          ['modalPrefixes']
        );
        if (!result.handled && !isHandled(interaction)) {
          await safeError(interaction, 'Эта форма больше не активна.');
        }
        return;
      }
    } catch (e) {
      logger.error('interactionCreate fatal error', {
        error: e.message,
        stack: e.stack,
      });
      await audit.log('error', 'interactionCreate fatal error', {
        error: e.message,
        stack: e.stack,
      });
      await safeError(interaction);
    }
  },
};
