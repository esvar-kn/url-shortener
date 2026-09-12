const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_ID_OFFSET = 100000000; // Offset of 100M ensures generated short codes start at 6 characters

/**
 * Base62 encodes an integer (e.g. auto-incrementing ID).
 * @param {number} num - Integer ID to encode
 * @param {number} [minLength=0] - Optional minimum character length
 * @returns {string} Base62 encoded short string
 */
function encodeBase62(num, minLength = 0) {
  let n = Math.floor(num);
  let result = '';
  while (n > 0) {
    result = BASE62[n % 62] + result;
    n = Math.floor(n / 62);
  }
  result = result || '0';

  while (result.length < minLength) {
    result = BASE62[0] + result;
  }
  return result;
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
  DEFAULT_ID_OFFSET,
  encodeBase62,
  decodeBase62
};
