const {
  Signature,
} = require('../');

const toPaddedDoubleDigitString = (number) => number < 10
  ? `0${number}`
  : `${number}`;

/**
 * Standard string representation of an author.
 * @param {Boolean} withTime Whether or not to include timestamp
 * @return {String} Representation of the author.
 */
Signature.prototype.toString = function(withTime) {
  const name = this.name().toString();
  const email = this.email().toString();

  const stringifiedSignature = `${name} <${email}>`;

  if (!withTime) {
    return stringifiedSignature;
  }

  const when = this.when();
  const offset = when.offset();
  const offsetMagnitude = Math.abs(offset);
  const time = when.time();

  const sign = (offset < 0 || when.sign() === '-') ? '-' : '+';
  const hours = toPaddedDoubleDigitString(Math.floor(offsetMagnitude / 60));
  const minutes = toPaddedDoubleDigitString(offsetMagnitude % 60);

  return `${stringifiedSignature} ${time} ${sign}${hours}${minutes}`;
};
