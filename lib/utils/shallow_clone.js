const NodeGit = require("../../");

const shallowClone = (...merges) =>
  merges.reduce(
    (outer, merge) => Object.keys(merge).reduce(
      (inner, key) => {
        inner[key] = merge[key];
        return inner;
      },
      outer
    ),
    {}
  );

NodeGit.Utils.shallowClone = shallowClone;
