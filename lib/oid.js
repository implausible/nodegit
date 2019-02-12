const {
  Oid
} = require("../");

// Backwards compatibility.
Oid.prototype.allocfmt = Oid.prototype.tostrS;

// Backwards compatibility.
Oid.prototype.toString = Oid.prototype.tostrS;

Oid.prototype.copy = Oid.prototype.cpy;

Oid.prototype.inspect = function() {
  return `[Oid ${this.toString()}]`;
};
