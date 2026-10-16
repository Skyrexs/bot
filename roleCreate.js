const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports = { name: Events.RoleCreate, async execute(role) {
  await audit.log('role', 'Роль создана', { guildId: role.guild.id, roleId: role.id, name: role.name, color: role.hexColor, position: role.position });
}};
