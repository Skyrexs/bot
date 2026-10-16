// handlers/captMclAdmin.js
// Admin reactions / management for CAPT / MCL per request
const db = require('../database');
const logger = require('../logger');
const config = require('../config');
const audit = require('../utils').audit;

module.exports = {
  // This handler does not expose buttons directly; messageReactionAdd (events) will call db updates.
};