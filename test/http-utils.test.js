import assert from 'node:assert/strict';
import test from 'node:test';
import { isIsoDate, rowsToCsv } from '../server/http-utils.js';
import { editableSettings, toPublicSettings } from '../server/public-settings.js';

test('isIsoDate accepte une date civile réelle au format ISO', () => {
  assert.equal(isIsoDate('2026-08-06'), true);
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('06/08/2026'), false);
  assert.equal(isIsoDate(null), false);
});

test('rowsToCsv échappe les séparateurs, guillemets et formules', () => {
  const csv = rowsToCsv([{ appareil: 'Cuisine; prise', valeur: '=1+1', note: 'dit "bonjour"' }]);
  assert.equal(csv, '\uFEFFappareil;valeur;note\n"Cuisine; prise";\'=1+1;"dit ""bonjour"""\n');
  assert.equal(rowsToCsv([]), '\uFEFF');
});

test('toPublicSettings ne renvoie jamais le jeton Linky', () => {
  assert.deepEqual(toPublicSettings({ conso_token: 'secret', prm: '1234' }), {
    conso_token: '',
    conso_token_configured: true,
    prm: '1234',
  });
});

test('editableSettings filtre les clés et préserve un jeton masqué', () => {
  assert.deepEqual(editableSettings({ price_kwh: 0.2, admin: true, conso_token: '' }), {
    price_kwh: '0.2',
  });
  assert.deepEqual(editableSettings({ clear_conso_token: true }), { conso_token: '' });
  assert.deepEqual(editableSettings(null), {});
});
