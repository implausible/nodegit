const {
  Odb,
} = require('../');

const {
  read: proto_Read,
} = Odb.prototype;

Odb.prototype.read = function(oid) {
  return proto_Read.call(this, oid);
};
