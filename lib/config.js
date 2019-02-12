const {
  Config
} = require("../");

Config.prototype.getString = function(...args) {
  return this.getStringBuf(...args);
};
