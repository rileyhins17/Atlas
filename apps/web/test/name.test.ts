import { describe, expect, it } from 'vitest';
import { firstNameFrom } from '../lib/name';

/**
 * The rule under test is "a derived name has to earn its place". Today greets
 * every user by this string, and it was previously the raw email local part.
 */
describe('firstNameFrom', () => {
  it('takes an explicit display name at its word', () => {
    expect(firstNameFrom('Riley Hinsperger', 'anything@example.com')).toBe('Riley');
    expect(firstNameFrom('riley', 'anything@example.com')).toBe('riley');
    // Someone who typed a lowercase name meant it; only DERIVED names are
    // capitalised, because those are being guessed at.
    expect(firstNameFrom('  Sam  ', 'x@y.com')).toBe('Sam');
  });

  it('derives a name from an address when the first segment looks like one', () => {
    expect(firstNameFrom(null, 'riley@gmail.com')).toBe('Riley');
    expect(firstNameFrom(null, 'riley.hinsperger@gmail.com')).toBe('Riley');
    expect(firstNameFrom(null, 'riley.hinsperger+atlas@gmail.com')).toBe('Riley');
    expect(firstNameFrom(null, 'riley_hinsperger@gmail.com')).toBe('Riley');
    expect(firstNameFrom(null, 'riley-h@gmail.com')).toBe('Riley');
  });

  it('says nothing rather than calling you a generated string', () => {
    // The exact shape the e2e suite and the screenshot rig produce.
    expect(firstNameFrom(null, 'e2e-1786439812956-81051@example.com')).toBe('');
    expect(firstNameFrom(null, 'phase2-test@example.com')).toBe('');
    expect(firstNameFrom(null, 'probe123@example.com')).toBe('');
    // An initial is not a name.
    expect(firstNameFrom(null, 'a@b.com')).toBe('');
    // Neither is a whole sentence of an address.
    expect(firstNameFrom(null, 'verylongbusinessaddressname@example.com')).toBe('');
  });

  it('has nothing to say with nothing to go on', () => {
    expect(firstNameFrom(null, null)).toBe('');
    expect(firstNameFrom(undefined, undefined)).toBe('');
    expect(firstNameFrom('', '')).toBe('');
    expect(firstNameFrom('   ', 'x')).toBe('');
  });
});
