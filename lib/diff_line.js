const {
  DiffLine
} = require("../");

const {
  content: proto_Content
} = DiffLine.prototype;

/**
* The relevant line
* @return {String}
*/
DiffLine.prototype.content = function() {
  if (!this._cache) {
    this._cache = new Buffer(this.rawContent())
      .slice(0, this.contentLen())
      .toString("utf8");
  }

  return this._cache;
};

/**
* The non utf8 translated text
* @return {String}
*/
DiffLine.prototype.rawContent = function() {
  return proto_Content.call(this);
};
