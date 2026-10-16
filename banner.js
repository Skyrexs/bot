const fs = require('fs');
const path = require('path');
const {
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} = require('discord.js');
const config = require('../config');
const db = require('../database');
const logger = require('../logger');

let cachedUrl = null;

function findAsset() {
  const assetsDir = path.join(__dirname, '..', 'assets');
  if (!fs.existsSync(assetsDir)) return null;

  const files = fs.readdirSync(assetsDir)
    .filter((name) => /\.(gif|webp|png|jpe?g)$/i.test(name))
    .sort((a, b) => {
      const rank = (name) => {
        if (/\.gif$/i.test(name)) return 0;
        if (/\.webp$/i.test(name)) return 1;
        if (/\.png$/i.test(name)) return 2;
        return 3;
      };
      return rank(a) - rank(b);
    });

  if (!files.length) return null;
  return path.join(assetsDir, files[0]);
}

function getBannerUrl() {
  if (cachedUrl) return cachedUrl;

  if (process.env.BANNER_URL) {
    cachedUrl = process.env.BANNER_URL;
    return cachedUrl;
  }

  const saved = db.getSetting?.('global_banner_url', null);
  const source = db.getSetting?.('global_banner_source', null);
  const assetPath = findAsset();
  const assetName = assetPath ? path.basename(assetPath) : null;

  if (saved && (source === 'env' || source === assetName)) {
    cachedUrl = saved;
    return saved;
  }

  return null;
}

function addBanner(container, url = getBannerUrl()) {
  if (!container || !url) return container;

  try {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(String(url))
      )
    );
  } catch (e) {
    logger.warn('Failed to add banner to container', {
      error: e.message,
    });
  }

  return container;
}

async function ensureBannerUrl(client) {
  const configured = process.env.BANNER_URL;
  if (configured) {
    cachedUrl = configured;
    db.setSetting?.('global_banner_url', configured);
    db.setSetting?.('global_banner_source', 'env');
    return configured;
  }

  const assetPath = findAsset();

  if (assetPath) {
    const assetName = path.basename(assetPath);
    const savedUrl = db.getSetting?.('global_banner_url', null);
    const savedSource = db.getSetting?.('global_banner_source', null);

    if (savedUrl && savedSource === assetName) {
      cachedUrl = savedUrl;
      return savedUrl;
    }

    const channelIds = [
      config.AUDIT_LOG_CHANNEL_ID,
      config.APPLICATION_LOG_CHANNEL_ID,
      config.BOT_RESTART_CHANNEL_ID,
    ]
      .filter(Boolean)
      .filter((id, index, arr) => arr.indexOf(id) === index);

    for (const channelId of channelIds) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased?.()) continue;

      try {
        const me = channel.guild?.members?.me;
        if (me?.permissions && !me.permissions.has('SendMessages')) {
          continue;
        }
      } catch {}

      try {
        const msg = await channel.send({
          files: [{
            attachment: assetPath,
            name: assetName,
          }],
        });

        const attachment = msg.attachments.first();

        if (attachment?.url) {
          cachedUrl = attachment.url;
          db.setSetting?.('global_banner_url', cachedUrl);
          db.setSetting?.('global_banner_source', assetName);

          logger.info('Banner loaded from assets', {
            file: assetName,
            channelId,
          });

          return cachedUrl;
        }
      } catch (e) {
        logger.warn('Failed to upload banner from assets', {
          error: e.message,
          channelId,
          file: assetName,
        });
      }
    }

    return null;
  }

  const saved = db.getSetting?.('global_banner_url', null);
  const savedSource = db.getSetting?.('global_banner_source', null);

  if (saved && savedSource === 'env') {
    cachedUrl = saved;
    return saved;
  }

  return null;
}

module.exports = {
  addBanner,
  getBannerUrl,
  ensureBannerUrl,
};
