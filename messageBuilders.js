const { addBanner } = require('./banner');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require('discord.js');

const E = {
  success:  '<:ttc:1516050705339912262>',
  error:    '<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786>',
  warning:  '<:vnimanie:1509630676603764737>',
  info:     '<a:870433649064026152:1507120744285474816>',
  arrow:    '<a:Animated_Arrow_White:1507122238686498967>',
  spin:     '<a:dddd:1507119555166601318>',
  fire:     '<a:3342emoshit:1507119849971650583>',
  star:     '<a:qwe1:1509712665445007566>',
  plus:     '<:freeiconplus3856900:1509629783317676124>',
  crown:    '<a:qwer0:1507121574111744063>',
  wave:     '<a:483a045a18644d3c8de001ce288bc40a:1507119681474007151>',
  clock:    '<a:hp2:1507120899340636240>',
  car:      '<a:c18b99570e564a0da34d48d92b6ca0d0:1507119775325618287>',
  gun:      '<a:qwe4:1507120971453173760>',
  user:     '<:754816forreal:1470442212020981963>',
};

function buildSimpleMessage(accentColor, icon, title, description) {
  const container = new ContainerBuilder().setAccentColor(accentColor);
  addBanner(container);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${icon} ${title}`)
  );
  if (description) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(description)
    );
  }
  return container;
}

const buildSuccessMessage = (title, description) => buildSimpleMessage(0x00C853, E.success, title, description);
const buildErrorMessage = (title, description) => buildSimpleMessage(0xFF0000, E.error, title, description);
const buildWarningMessage = (title, description) => buildSimpleMessage(0xFFA500, E.warning, title, description);
const buildInfoMessage = (title, description) => buildSimpleMessage(0x0099FF, E.info, title, description);

const CV2_EPHEMERAL = MessageFlags.IsComponentsV2 | 64;
const CV2_PUBLIC = MessageFlags.IsComponentsV2;

module.exports = { buildSuccessMessage, buildErrorMessage, buildWarningMessage, buildInfoMessage, E, CV2_EPHEMERAL, CV2_PUBLIC };