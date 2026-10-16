const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { cleanExpiredCooldowns, initWarehouseItem } = require('./database');
const logger = require('./logger');
const config = require('./config');

const token = process.env.DISCORD_TOKEN || config.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN не найден в .env или config!');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildScheduledEvents,
  ],
});
client.setMaxListeners(30);
global.client = client;

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
  for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    try {
      const cmd = require(path.join(commandsPath, file));
      if ('data' in cmd && 'execute' in cmd) {
        client.commands.set(cmd.data.name, cmd);
        console.log(`✓ Команда: ${cmd.data.name}`);
      } else {
        console.warn(`Команда ${file} не имеет data/execute`);
      }
    } catch (e) {
      console.error(`Ошибка загрузки команды ${file}:`, e.message);
    }
  }
}

const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
    try {
      const event = require(path.join(eventsPath, file));
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }
      console.log(`✓ Событие: ${event.name}`);
    } catch (e) {
      console.error(`Ошибка загрузки события ${file}:`, e.message);
    }
  }
}

setInterval(cleanExpiredCooldowns, 60 * 60 * 1000);

client.on('error', e => logger.error('Ошибка клиента Discord', { error: e.message, stack: e.stack }));
client.on('warn',  w => logger.warn('Предупреждение Discord', { warning: w }));
client.on('shardError', e => logger.error('Ошибка шарда Discord', { error: e.message, stack: e.stack }));
client.on('shardDisconnect', (event, id) => logger.info('Шард отключился', { id, code: event?.code, reason: event?.reason }));
client.on('shardReconnecting', id => logger.info('Шард переподключается', { id }));

process.on('unhandledRejection', (reason) => {
  const stack = reason && reason.stack ? reason.stack : undefined;
  logger.error('Необработанный Promise rejection', { reason: String(reason), stack });
});
            
process.on('uncaughtException', (error) => {
  const mem = process.memoryUsage();
  logger.error('Необработанное исключение', {
    error: error.message,
    stack: error.stack,
    memoryMB: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
    },
  });
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.warn('Получен SIGTERM — процесс завершается (например, PM2 restart/stop)');
  process.exit(0);
});

client.login(token).catch(e => {
  console.error('Ошибка подключения к Discord:', e.message);
  process.exit(1);
});