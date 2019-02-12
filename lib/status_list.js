const {
  StatusList,
  StatusOptions,
  Utils: {
    normalizeOptions,
  },
} = require('../');

const {
  create: static_Create,
} = StatusList;

StatusList.create = (repo, options) =>
  static_Create(repo, normalizeOptions(options, StatusOptions));
