/**
 * `map[key]` only when the map itself has the key. A key that comes from outside the console (an event type, a
 * configuration name) can be 'constructor' or '__proto__', which a plain lookup finds on every object.
 */
export const own = <T,>(map: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
