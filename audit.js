const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require('discord.js');

const logger = require('../logger');
const config = require('../config');
const { addBanner } = require('./banner');

let clientRef = null;
let queue = Promise.resolve();
let queueLength = 0;

function init(client) {
  clientRef = client;
  logger.info('audit.init: client attached');
}

function getCandidateChannelIds() {
  return [
    config.AUDIT_LOG_CHANNEL_ID,
    config.APPLICATION_LOG_CHANNEL_ID,
    config.BOT_RESTART_CHANNEL_ID,
  ].filter(Boolean).filter((id, index, arr) => arr.indexOf(id) === index);
}

async function findWritableChannel() {
  if (!clientRef) return null;

  for (const channelId of getCandidateChannelIds()) {
    const channel = await clientRef.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) continue;

    try {
      const me = channel.guild?.members?.me;
      if (me?.permissions && !me.permissions.has('SendMessages')) continue;
    } catch {}

    return channel;
  }

  return null;
}

async function sendToChannel(title, body) {
  try {
    const channel = await findWritableChannel();
    if (!channel) {
      logger.warn('Audit log channel is unavailable', {
        candidates: getCandidateChannelIds(),
      });
      return false;
    }

    const safeBody = String(body || '-').slice(0, 5000);

    const container = new ContainerBuilder().setAccentColor(0x17151F);
    addBanner(container);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🛡️ ${String(title).slice(0, 240)}`
      )
    );

    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(safeBody)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(false)
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# AUDIT • <t:${Math.floor(Date.now() / 1000)}:F>`
      )
    );

    try {
      await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
      return true;
    } catch (sendError) {
      await channel.send({
        content: `🛡️ **${String(title).slice(0, 200)}**\n${safeBody.slice(0, 1800)}`,
        allowedMentions: { parse: [] },
      }).catch(() => {});

      logger.warn('Audit Components V2 send failed; fallback message attempted', {
        error: sendError.message,
      });
      return false;
    }
  } catch (e) {
    logger.error('audit.sendToChannel error', {
      error: e.message,
      stack: e.stack,
    });
    return false;
  }
}

function enqueueSend(title, body) {
  queueLength += 1;

  queue = queue
    .then(async () => {
      await sendToChannel(title, body);
      await new Promise((resolve) => setTimeout(resolve, 150));
    })
    .catch((e) => {
      logger.error('audit queue error', { error: e.message, stack: e.stack });
    })
    .finally(() => {
      queueLength = Math.max(0, queueLength - 1);
    });
}

async function log(type, title, meta = {}) {
  try {
    const metaStr =
      typeof meta === 'string'
        ? meta
        : JSON.stringify(meta, replacer, 2);

    logger.info(`AUDIT ${type}: ${title} ${metaStr}`);

    const body =
      `**Тип:** \`${type}\`\n` +
      `**Событие:** ${title}\n\n` +
      '```json\n' +
      metaStr.slice(0, 3500) +
      '\n```';

    enqueueSend(title, body);
  } catch (e) {
    logger.error('audit.log error', {
      error: e.message,
      stack: e.stack,
    });
  }
}

function replacer(key, value) {
  if (key === 'stack' && typeof value === 'string') {
    const lines = value.split('\n');
    return lines.slice(0, 8).join('\n') +
      (lines.length > 8 ? '\n...' : '');
  }
  return value;
}

module.exports = {
  init,
  log,
  sendToChannel,
  getCandidateChannelIds,
  get queueLength() { return queueLength; },
};
