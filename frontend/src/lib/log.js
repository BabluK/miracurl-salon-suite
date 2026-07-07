// Central dev-only logger — production builds stay silent (see index.js kill switch).
const dev = process.env.NODE_ENV !== "production";

const log = {
  debug: (...args) => { if (dev) console.debug(...args); },
  warn: (...args) => { if (dev) console.warn(...args); },
  error: (...args) => { if (dev) console.error(...args); },
};

export default log;
