/**
 * Vendor builds alias ``react`` here so the CDN syntax-highlight bundle
 * shares the host app's React instance (set on ``globalThis.__MINIBOT_REACT__``
 * before the dynamic import).
 *
 * react-syntax-highlighter only uses the default export (``React.createElement``).
 */
type ReactNs = typeof import("react");

declare global {
  // eslint-disable-next-line no-var
  var __MINIBOT_REACT__: ReactNs | undefined;
}

const React = globalThis.__MINIBOT_REACT__;
if (!React) {
  throw new Error("minibot syntax vendor: __MINIBOT_REACT__ is not set");
}

export default React;
