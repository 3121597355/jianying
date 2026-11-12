'use strict';
const { isIP } = require('node:net');

// Nginx must overwrite X-Real-IP, and Node must listen only on loopback.
module.exports = function clientAddress(req, trustProxy = process.env.TRUST_PROXY) {
  const address = req.socket?.remoteAddress || 'unknown';
  const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
  const forwarded = req.headers?.['x-real-ip'];
  return trustProxy === 'loopback' && loopback && typeof forwarded === 'string' && isIP(forwarded)
    ? forwarded : address;
};
