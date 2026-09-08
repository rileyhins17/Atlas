import { expect, it } from 'vitest';
import { parseMoneyInput } from '../src/money.js';

it('converts typed decimal money to exact integer cents', () => {
  expect(parseMoneyInput('185.29')).toBe(18529);
  expect(parseMoneyInput('0.01')).toBe(1);
  expect(parseMoneyInput('-12.5')).toBe(-1250);
  expect(parseMoneyInput(' 001.20 ')).toBe(120);
});

it('rejects incomplete, ambiguous, over-precision and unsafe amounts', () => {
  for (const value of ['', '-', '1.', '1.234', '1,234', '1e3', 'NaN', '900719925474099.99']) {
    expect(parseMoneyInput(value)).toBeNull();
  }
});
