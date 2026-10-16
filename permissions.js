const config = require('../config');

function normalizeRoleTarget(roleTarget) {
  if (!roleTarget || typeof roleTarget !== 'string') return null;
  const trimmed = roleTarget.trim();
  const mentionMatch = trimmed.match(/^<@&(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];
  return trimmed;
}

function hasRole(member, roleId) {
  if (!member || !roleId) return false;
  const target = normalizeRoleTarget(roleId);
  if (!target) return false;

  const cache = member.roles?.cache;
  if (!cache) return false;

  if (typeof cache.has === 'function') {
    if (cache.has(target)) return true;
  }

  const lower = target.toLowerCase();
  return cache.some?.((role) => {
    const roleIdValue = typeof role?.id === 'string' ? role.id : null;
    const roleName = typeof role?.name === 'string' ? role.name.toLowerCase() : '';
    return roleIdValue === target || roleName === lower;
  }) || false;
}

function hasDeputyOwnerAccess(member) {
  if (!member) return false;

  if (config.DEPUTY_OWNER_ROLE_ID && hasRole(member, config.DEPUTY_OWNER_ROLE_ID)) return true;

  const variants = [
    ...(Array.isArray(config.DEPUTY_OWNER_ROLE_NAMES) ? config.DEPUTY_OWNER_ROLE_NAMES : []),
    'зам овнера',
    'зам. овнера',
    'замовнер',
    'заместитель владельца',
    'deputy owner',
    'deputy-owner',
    'deputy_owner',
  ];

  const normalized = member.roles?.cache?.some((role) => {
    const roleName = typeof role?.name === 'string' ? role.name.toLowerCase().trim() : '';
    if (!roleName) return false;
    return variants.some((variant) => {
      const normalizedVariant = typeof variant === 'string' ? variant.toLowerCase().trim() : '';
      if (!normalizedVariant) return false;
      if (roleName === normalizedVariant) return true;
      if (roleName.includes(normalizedVariant) || normalizedVariant.includes(roleName)) return true;
      const compactRoleName = roleName.replace(/[^a-zа-я0-9]/g, '');
      const compactVariant = normalizedVariant.replace(/[^a-zа-я0-9]/g, '');
      return compactRoleName.includes(compactVariant) || compactVariant.includes(compactRoleName);
    });
  });

  return Boolean(normalized);
}

function hasFullAdminAccess(member) {
  if (!member) return false;
  if (Array.isArray(config.ADMIN_ROLES) && config.ADMIN_ROLES.some((id) => hasRole(member, id))) return true;
  return hasDeputyOwnerAccess(member);
}

function hasAdminAccess(member) {
  return hasFullAdminAccess(member);
}

function hasModeratorAccess(member) {
  if (!member) return false;
  if (hasRole(member, config.HIGH_STAFF_ROLE_ID)) return true;
  return hasFullAdminAccess(member);
}

function hasBenzoAccess(member) {
  if (!member) return false;
  return hasRole(member, config.BENZO_ROLE_ID) || hasModeratorAccess(member);
}

function canAccessProfile(member) {
  return hasBenzoAccess(member);
}

module.exports = {
  hasRole,
  hasAdminAccess,
  hasFullAdminAccess,
  hasModeratorAccess,
  hasBenzoAccess,
  canAccessProfile,
};
