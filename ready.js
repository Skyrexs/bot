// events/ready.js - REPLACED with panels for Vacation, Giveaway, TempRooms, Verification, CAPT/MCL admin panel
const { Events, MessageFlags } = require('discord.js');
const logger = require('../logger');
const config = require('../config');
const utils = require('../utils');
const audit = utils.audit;
const db = require('../database');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    try {
      logger.info(`Бот готов к работе: ${client.user.tag}`);
      if (typeof audit.init === 'function') audit.init(client);
      try {
        const { ensureBannerUrl } = require('../utils/banner');
        await ensureBannerUrl(client);
      } catch (e) {
        logger.warn('Banner initialization failed', { error: e.message });
      }

      // backups etc. (keep existing code for backups and voice sessions)
      try {
        const maintenance = require('../utils/maintenance');
        await maintenance.maybeCreateDailyBackup();
        if (!global.__dailyBackupTimer) {
          global.__dailyBackupTimer = setInterval(() => {
            maintenance.maybeCreateDailyBackup().catch((e) =>
              logger.error('Automatic database backup failed', { error: e.message, stack: e.stack })
            );
          }, 24 * 60 * 60 * 1000);
        }
      } catch (e) {
        logger.error('Backup subsystem initialization failed', { error: e.message, stack: e.stack });
      }

      audit.log('startup', 'Bot started', { bot: client.user.tag, id: client.user.id, ts: Date.now() });

      // restore voice sessions and other startup tasks (existing code omitted for brevity)
      try {
        const { restoreVoiceSessions, processVoicePoints, syncVoiceSessions } = require('../database');
        // ... original voice restore logic copied here (omitted in this snippet for brevity)
      } catch (e) {
        logger.error('Failed to restore voice sessions', { error: e.message, stack: e.stack });
      }

      // Register commands (existing)
      try {
        const commands = client.commands.filter((c) => c.internal !== true).map((c) => c.data.toJSON());
        await client.application.commands.set(commands);
        logger.info(`Зарегистрировано команд: ${commands.length}`);
        audit.log('commands', 'Commands registered', { count: commands.length });
      } catch (e) {
        logger.error('Ошибка регистрации команд', { error: e.message });
      }

      // Panels to send on startup: keep panels you requested
      try {
        const panels = [
          { label: 'Панель заявок', channelId: config.BOT_RESTART_CHANNEL_ID, build: () => utils.buildApplicationMessage(), ids: ['application_select'] },
          { label: 'Панель правил', channelId: config.BOT_SECOND_CHANNEL_ID, build: () => utils.buildSecondMessage(), ids: [] },
          { label: 'Путеводитель', channelId: config.GUIDANCE_CHANNEL_ID, build: () => utils.buildGuidanceMessage(), ids: [] },
          { label: 'Панель модов', channelId: config.MODS_PANEL_CHANNEL_ID, build: () => require('../utils/modsPanel').buildModsPanelMessage(), ids: ['mods_panel_select'] },
          { label: 'Панель ОТПУСК', channelId: config.AFK_PANEL_CHANNEL_ID, build: () => require('../utils/vacationPanel').buildVacationPanel(), ids: ['vacation_submit'] },
          { label: 'Панель TIER', channelId: config.TIER_PANEL_CHANNEL_ID, build: () => utils.buildTierPanelMessage(), ids: ['tier_panel_btn'] },
          { label: 'Панель магазина', channelId: config.SHOP_PANEL_CHANNEL_ID, build: () => utils.buildShopPanel(), ids: ['shop_get_btn', 'shop_spend_btn', 'shop_rating_btn'] },
          { label: 'Панель склада', channelId: config.WAREHOUSE_PANEL_CHANNEL_ID, build: async () => { const warehouse = require('../handlers/warehouse'); await warehouse.initWarehouse(); return warehouse.buildWarehousePanel(client.guilds.cache.first()); }, ids: ['warehouse_take_', 'warehouse_return_'] },
          { label: 'Панель Розыгрышей', channelId: process.env.GIVEAWAY_CHANNEL_ID || config.BOT_RESTART_CHANNEL_ID, build: () => require('../utils/giveawayPanel').buildGiveawayAdminPanel(), ids: ['giveaway_create', 'giveaway_list'] },
          { label: 'Панель временных комнат', channelId: process.env.TEMP_VC_CREATION_TEXT_CHANNEL_ID || config.BOT_RESTART_CHANNEL_ID, build: () => require('../utils/tempRoomsPanel').buildTempRoomsPanel(), ids: ['temp_create_room'] },
          { label: 'Панель верификации', channelId: process.env.VERIFICATION_PANEL_CHANNEL_ID || config.BOT_RESTART_CHANNEL_ID, build: () => require('../utils/verificationPanel')?.buildVerificationPanel?.() || null, ids: [] },
          { label: 'CAPT/MCL — панель управления', channelId: config.CAPT_MCL_CHANNEL_ID, build: () => require('../utils/captMclPanel').buildAdminPanel ? require('../utils/captMclPanel').buildAdminPanel() : null, ids: [] },
        ];

        for (const panel of panels) {
          try {
            if (!panel.channelId) {
              logger.warn(`${panel.label}: channelId не задан в config`);
              audit.log('warn', 'Panel skipped, no channelId', { label: panel.label });
              continue;
            }

            const ch = await client.channels.fetch(panel.channelId).catch(() => null);
            if (!ch || !ch.isTextBased?.()) {
              logger.warn(`${panel.label}: канал не найден или не текстовый`, { id: panel.channelId });
              audit.log('warn', `${panel.label}: channel not found or not text-based`, { panel: panel.label, channelId: panel.channelId });
              continue;
            }

            const payload = await panel.build();
            if (!payload) {
              logger.warn(`${panel.label}: build() вернул null`);
              audit.log('warn', `${panel.label}: build returned null`, { panel: panel.label });
              continue;
            }

            try {
              const fetched = await ch.messages.fetch({ limit: 100 });
              const botMessages = fetched.filter((m) => m.author?.id === client.user.id);
              if (botMessages.size) {
                await ch.bulkDelete(botMessages, true).catch(async () => {
                  for (const msg of botMessages.values()) {
                    await msg.delete().catch(() => {});
                  }
                });
              }
            } catch (e) {
              logger.warn(`${panel.label}: ошибка очистки старых панелей`, { error: e.message });
            }

            const sendOptions = payload.flags ? { components: payload.components, flags: payload.flags } : payload;
            const sentPanel = await ch.send(sendOptions);

            if (panel.label === 'Панель склада' && sentPanel?.id) {
              require('../database').setWarehouseMessageId(sentPanel.id);
            }

            audit.log('panel', `Panel sent/updated`, {
              panel: panel.label,
              channelId: panel.channelId,
              messageId: sentPanel?.id,
            });
            logger.info(`${panel.label} sent to ${panel.channelId}`);
          } catch (e) {
            logger.error(`Ошибка отправки панели ${panel.label}`, { error: e.message, stack: e.stack });
            audit.log('error', `Failed to send panel: ${panel.label}`, { error: e.message });
          }
        }
        logger.info('Все панели обработаны');
      } catch (e) {
        logger.error('Ошибка отправки стартовых панелей', { error: e.message, stack: e.stack });
        audit.log('error', 'Failed to send startup panels', { error: e.message, stack: e.stack });
      }

      // Setup scheduled finishing for giveaways and cleaning temp rooms
      try {
        const scheduleTick = async () => {
          try {
            // Finish giveaways whose endsAt <= now
            const now = Date.now();
            const toFinish = db.db.prepare('SELECT * FROM giveaways WHERE status = ? AND endsAt <= ?').all('active', now);
            for (const g of toFinish) {
              const participants = db.db.prepare('SELECT userId FROM giveaways_participants WHERE giveawayId=?').all(g.id).map(r=>r.userId);
              if (participants.length) {
                const winner = participants[Math.floor(Math.random() * participants.length)];
                // announce winner
                try {
                  const ch = await client.channels.fetch(g.channelId).catch(()=>null);
                  if (ch && ch.isTextBased && ch.isTextBased()) {
                    await ch.send(`🎉 Победитель розыгрыша **${g.title}**: <@${winner}> — поздравляем! Приз: ${g.prize}`).catch(()=>{});
                  }
                  const user = await client.users.fetch(winner).catch(()=>null);
                  if (user) user.send(`Вы выиграли розыгрыш "${g.title}"! Приз: ${g.prize}`).catch(()=>{});
                } catch (e) {}
              } else {
                try {
                  const ch = await client.channels.fetch(g.channelId).catch(()=>null);
                  if (ch && ch.isTextBased && ch.isTextBased()) await ch.send(`Розыгрыш **${g.title}** завершился — участников не найдено.`).catch(()=>{});
                } catch (e) {}
              }
              db.db.prepare('UPDATE giveaways SET status=?, endsAt=? WHERE id=?').run('finished', g.endsAt, g.id);
              audit.log('giveaway', 'Finished', { id: g.id });
            }

            // Clean expired temp rooms
            const expired = db.db.prepare('SELECT * FROM temp_rooms WHERE expiresAt <= ?').all(now);
            for (const r of expired) {
              try {
                const guilds = client.guilds.cache;
                for (const g of guilds.values()) {
                  const vc = await g.channels.fetch(r.voiceChannelId).catch(()=>null);
                  if (vc) await vc.delete(`Temp room expired`).catch(()=>{});
                  const tc = await g.channels.fetch(r.textChannelId).catch(()=>null);
                  if (tc) await tc.delete(`Temp room expired`).catch(()=>{});
                }
              } catch (e) {}
              db.db.prepare('DELETE FROM temp_rooms WHERE id=?').run(r.id);
              audit.log('temproom', 'Deleted expired', { id: r.id });
            }
          } catch (e) {
            logger.error('scheduled tick error', { error: e.message, stack: e.stack });
          }
        };

        if (!global.__scheduledTick) {
          global.__scheduledTick = setInterval(scheduleTick, 30 * 1000);
          // also run once now
          scheduleTick().catch(()=>{});
        }
      } catch (e) {
        logger.warn('Failed to start scheduled tasks', { error: e.message });
      }

    } catch (e) {
      logger.error('Ошибка в ready handler', { error: e.message, stack: e.stack });
      audit.log('error', 'ready handler failed', { error: e.message, stack: e.stack });
    }
  },
};