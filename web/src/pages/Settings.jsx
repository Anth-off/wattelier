import { useEffect, useState } from 'react';
import { api, post } from '../api.js';

export default function Settings({ status }) {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('settings')
      .then(setSettings)
      .catch(() => {});
  }, []);

  if (!settings) return <div className="empty">Chargement…</div>;

  const set = (key) => (e) => setSettings((s) => ({ ...s, [key]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const next = await post('settings', settings);
      setSettings(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const toggleDemo = async () => {
    const next = await post('settings', {
      ...settings,
      demo_mode: settings.demo_mode === '1' ? '0' : '1',
    });
    setSettings(next);
  };

  const clearConsoToken = async () => {
    const next = await post('settings', { clear_conso_token: true });
    setSettings(next);
  };

  return (
    <>
      <div className="panel">
        <h2>Mode démo</h2>
        <div className="toggle-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            className={`toggle ${settings.demo_mode === '1' ? 'on' : ''}`}
            onClick={toggleDemo}
            role="switch"
            aria-checked={settings.demo_mode === '1'}
          >
            <span className="track" />
            <span>
              {settings.demo_mode === '1' ? 'Activé — données factices affichées' : 'Désactivé'}
            </span>
          </div>
        </div>
        <p className="note" style={{ marginBottom: 0 }}>
          Génère un an de données plausibles (compteur + 4 appareils) pour explorer tous les
          graphiques en attendant les vraies données. La désactivation supprime toutes les données
          de démonstration ; les données réelles ne sont jamais touchées.
        </p>
      </div>

      <div className="panel">
        <h2>Tarif EDF (Base)</h2>
        <form
          className="settings"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label>
            Prix du kWh TTC (€)
            <input
              type="number"
              step="0.0001"
              min="0"
              value={settings.price_kwh}
              onChange={set('price_kwh')}
            />
          </label>
          <label>
            Abonnement mensuel TTC (€)
            <input
              type="number"
              step="0.01"
              min="0"
              value={settings.subscription_month}
              onChange={set('subscription_month')}
            />
          </label>
          <label>
            Puissance souscrite (kVA)
            <input
              type="number"
              step="1"
              min="3"
              max="36"
              value={settings.kva}
              onChange={set('kva')}
            />
          </label>
          <label>
            Budget mensuel (€, optionnel)
            <input
              type="number"
              step="1"
              min="0"
              placeholder="ex : 45"
              value={settings.budget_month_eur}
              onChange={set('budget_month_eur')}
            />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Composition du « reste non mesuré »
            <textarea
              value={settings.unmetered_note}
              onChange={set('unmetered_note')}
              placeholder="ex : éclairage, plaque de cuisson… (chauffage/eau chaude collectifs = hors compteur)"
            />
          </label>
        </form>
        <p className="note">
          Reportez les valeurs exactes de votre facture EDF (rubrique « caractéristiques de votre
          contrat »). Le budget mensuel affiche une jauge de suivi et une alerte de dépassement
          prévisionnel dans les Stats avancées. Le « reste non mesuré » (conso maison − prises) est
          décrit dans l'onglet Par appareil : indiquez ce qu'il contient chez vous.
        </p>
      </div>

      <div className="panel">
        <h2>Compteur Linky (Conso API)</h2>
        <form
          className="settings"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label>
            Numéro PRM / PDL (14 chiffres)
            <input value={settings.prm} onChange={set('prm')} placeholder="12345678901234" />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Token Conso API
            <textarea
              value={settings.conso_token}
              onChange={set('conso_token')}
              placeholder={
                settings.conso_token_configured
                  ? 'Token enregistré — saisissez une nouvelle valeur pour le remplacer'
                  : 'xxx.yyy.zzz (collez le token obtenu sur conso.boris.sh)'
              }
            />
          </label>
        </form>
        <p className="note">
          Marche à suivre (2 minutes, dès que le Linky apparaît dans votre espace Enedis) :<br />
          1. Sur{' '}
          <a href="https://mon-compte-particulier.enedis.fr" target="_blank" rel="noreferrer">
            votre espace Enedis
          </a>
          , activez « l'enregistrement et la collecte de la consommation horaire » (menu Gérer
          l'accès à mes données).
          <br />
          2. Sur{' '}
          <a href="https://conso.boris.sh" target="_blank" rel="noreferrer">
            conso.boris.sh
          </a>
          , donnez votre consentement → vous obtenez un token personnel et votre numéro PRM.
          <br />
          3. Collez-les ci-dessus et enregistrez : l'historique se remplit automatiquement (et se
          rattrape à chaque démarrage).
        </p>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer les réglages'}
          </button>
          {settings.conso_token_configured && (
            <button className="btn" onClick={clearConsoToken} type="button">
              Supprimer le token
            </button>
          )}
          {saved && <span style={{ color: 'var(--good-text)', fontSize: 13 }}>✓ Enregistré</span>}
        </div>
      </div>

      <div className="panel">
        <h2>État des connexions</h2>
        <table className="data">
          <tbody>
            <tr>
              <td>Linky (Conso API)</td>
              <td>
                {!status?.linky?.configured && 'Non configuré — renseignez le token ci-dessus'}
                {status?.linky?.configured && status.linky.lastError && (
                  <span style={{ color: 'var(--crit)' }}>Erreur : {status.linky.lastError}</span>
                )}
                {status?.linky?.configured &&
                  !status.linky.lastError &&
                  status.linky.waitingForData &&
                  'Token OK — en attente des premières données Enedis (normal pour un compteur posé récemment, comptez 24-48 h)'}
                {status?.linky?.configured &&
                  !status.linky.lastError &&
                  !status.linky.waitingForData &&
                  `Connecté — ${status.linky.daysInDb} jour(s) d'historique${status.linky.lastSync ? ` · dernière synchro ${new Date(status.linky.lastSync).toLocaleTimeString('fr-FR')}` : ''}`}
              </td>
            </tr>
            <tr>
              <td>Prises Sonoff (eWeLink)</td>
              <td>
                {!status?.sonoff?.configured && (
                  <>
                    Non configuré — remplissez <code>EWELINK_EMAIL</code> et{' '}
                    <code>EWELINK_PASSWORD</code> dans le fichier <code>.env</code> puis relancez
                  </>
                )}
                {status?.sonoff?.configured && status.sonoff.lastError && (
                  <span style={{ color: 'var(--crit)' }}>Erreur : {status.sonoff.lastError}</span>
                )}
                {status?.sonoff?.configured &&
                  !status.sonoff.lastError &&
                  `${status.sonoff.deviceCount} prise(s) avec mesure de puissance · cloud ${status.sonoff.cloudOnline ? 'connecté' : 'déconnecté'} · ${status.sonoff.lanDevices} appareil(s) vus sur le réseau local`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Accès depuis un autre appareil</h2>
        <p className="note">
          Le dashboard est accessible depuis un téléphone ou une tablette connectés au{' '}
          <b>même réseau</b> que ce PC :
        </p>
        <div className="row" style={{ marginTop: 6 }}>
          {(status?.urls || []).map((u) => (
            <code
              key={u}
              style={{
                background: 'var(--page)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 13,
              }}
            >
              {u}
            </code>
          ))}
          {(!status?.urls || status.urls.length === 0) && (
            <span className="note">adresses non détectées</span>
          )}
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          Le PC doit rester allumé (voir <code>install-startup.ps1</code> pour le démarrage
          automatique).
        </p>
      </div>

      <div className="panel">
        <h2>Export CSV</h2>
        <div className="row">
          <a className="btn secondary" href="/api/export.csv?what=daily" download>
            Conso quotidienne (Linky)
          </a>
          <a className="btn secondary" href="/api/export.csv?what=loadcurve" download>
            Courbe de charge 30 min
          </a>
          <a className="btn secondary" href="/api/export.csv?what=hourly" download>
            Énergie horaire par prise
          </a>
          <a className="btn secondary" href="/api/export.csv?what=readings" download>
            Relevés bruts des prises
          </a>
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          Séparateur « ; », encodage UTF-8 — s'ouvre directement dans Excel. Les relevés bruts sont
          conservés {settings.raw_retention_days} jours (les agrégats horaires et quotidiens sont
          conservés sans limite).
        </p>
      </div>
    </>
  );
}
