/** Only HIVA_* variables exist at runtime; babel.config.js inlines them at bundle time. */
declare const process: {env: {[key: string]: string | undefined}};
