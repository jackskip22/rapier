// REJECT: a banned binding introduced into a module that used to be blanket-exempted is caught,
// because it is imported like any other module and walked like any other module.
import { vendoredOperation } from './reject-formerly-exempt-vendored.mjs';
export function decide() {
  return vendoredOperation();
}
