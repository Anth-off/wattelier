const EDITABLE_KEYS = new Set([
  'price_kwh',
  'subscription_month',
  'kva',
  'conso_token',
  'prm',
  'demo_mode',
  'raw_retention_days',
  'budget_month_eur',
  'billing_start',
  'billing_end',
  'unmetered_note',
]);

/**
 * Retire les secrets d'un objet de réglages destiné à une réponse HTTP.
 * @param {Record<string, string | null>} settings
 */
export function toPublicSettings(settings) {
  const token = settings.conso_token ?? '';
  return {
    ...settings,
    conso_token: '',
    conso_token_configured: Boolean(token),
  };
}

/**
 * Filtre une charge utile non fiable et évite qu'un champ secret masqué vide
 * n'efface le jeton déjà enregistré.
 * @param {unknown} body
 */
export function editableSettings(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};

  const source = /** @type {Record<string, unknown>} */ (body);
  /** @type {Record<string, string>} */
  const output = {};
  for (const [key, value] of Object.entries(source)) {
    if (!EDITABLE_KEYS.has(key)) continue;
    if (key === 'conso_token' && value === '' && source.clear_conso_token !== true) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      output[key] = String(value);
    }
  }
  if (source.clear_conso_token === true) output.conso_token = '';
  return output;
}
