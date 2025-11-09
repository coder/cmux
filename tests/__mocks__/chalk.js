// Minimal Chalk mock for Jest - returns input unchanged, exposes used methods
const identity = (s) => (typeof s === "string" ? s : String(s));

const chalkMock = {
  dim: identity,
  cyan: identity,
  gray: identity,
  red: identity,
};

module.exports = { default: chalkMock };
