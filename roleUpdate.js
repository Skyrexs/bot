const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports = { name: Events.RoleUpdate, async execute(oldRole, newRole) {
  await audit.log('role', 'Роль изменена', {
    guildId: newRole.guild.id, roleId: newRole.id,
    oldName: oldRole.name, newName: newRole.name,
    oldColor: oldRole.hexColor, newColor: newRole.hexColor,
    oldPosition: oldRole.position, newPosition: newRole.position,
  });
}};
