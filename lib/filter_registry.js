const {
  Filter,
  FilterRegistry,
  Utils: {
    normalizeOptions,
    shallowClone,
  },
} = require('../');

const {
  register: static_Register,
} = FilterRegistry;

// register should add filter by name to dict and return
// Override FilterRegistry.register to normalize Filter
FilterRegistry.register = async (name, filter, priority) => {
  if (!filter.check || !filter.apply) {
    throw new Error('ERROR: please provide check and apply callbacks for filter');
  }

  // setting default value of attributes
  const preNormalizedFilter = shallowClone(filter);

  if (!preNormalizedFilter.attributes) {
    preNormalizedFilter.attributes = '';
  }

  const normalizedFilter = normalizeOptions(preNormalizedFilter, Filter);

  return static_Register(name, normalizedFilter, priority);
};
