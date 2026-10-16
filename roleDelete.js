const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports = { name: Events.RoleDelete, async execute(role) {
  await audit.log('role', 'Роль удалена', { guildId: role.guild.id, roleId: role.id, name: role.name, color: role.hexColor });
}};
