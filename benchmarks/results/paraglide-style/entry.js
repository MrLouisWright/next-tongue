import { k0 } from './k0.js';
import { k1 } from './k1.js';
export function render(locale, name) {
  return k0(locale, name) + ' | ' + k1(locale, name);
}
