const {
  OdbObject,
} = require('../');

OdbObject.prototype.toString = function(size = this.size()) {
  return this.data().toBuffer(size).toString();
};
