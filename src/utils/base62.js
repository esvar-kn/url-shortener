const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Base62 encodes an integer (e.g. auto-incrementing ID).
 * @param {number} num - Integer ID to encode
 * @returns {string} Base62 encoded short string
 */
function encodeBase62(num) {
  let result = '';
  while (num > 0) {
    result = BASE62[num % 62] + result;
    num = Math.floor(num / 62);
  }
  return result || '0';
}

/**
 * Base62 decodes a short string back to its integer ID.
 * @param {string} str - Base62 encoded string
 * @returns {number} Decoded integer ID
 */
function decodeBase62(str) {
  if (typeof str !== 'string' || str.length === 0) {
    throw new TypeError('Input must be a non-empty string');
  }

  let num = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const index = BASE62.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base62 character '${char}'`);
    }
    num = num * 62 + index;
  }
  return num;
}

module.exports = {
  BASE62,
  encodeBase62,
  decodeBase62
};
