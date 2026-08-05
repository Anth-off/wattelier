import {
  db,
  upsertDevice,
  addHourlyWh,
  insertReading,
  upsertLinkyDaily,
  upsertLoadCurve,
  upsertMaxPower,
  purgeDemoData,
} from './db.js';

/**
 * Générateur de données de démonstration (source='demo') : permet de valider
 * tous les graphiques avant l'arrivée des vraies données (Linky posé récemment).
 */

const DEMO_DEVICES = [
  { id: 'demo-frigo', name: 'Frigo (démo)', base: 45, spikes: 90, always: true },
  { id: 'demo-tv', name: 'TV + box (démo)', base: 8, evening: 140 },
  { id: 'demo-lavelinge', name: 'Lave-linge (démo)', cycles: true },
  { id: 'demo-pc', name: 'PC bureau (démo)', base: 4, day: 180 },
];

function rnd(a, b) {
  return a + Math.random() * (b - a);
}

/** Puissance simulée (W) d'un appareil à une heure donnée. */
function devicePower(dev, date, hour) {
  if (dev.cycles) {
    // lave-linge : ~4 cycles/semaine, 2h à ~1200 W en journée
    const seed = date.getDate() * 7 + date.getMonth();
    const runDay =
      seed % 7 < 4 && (date.getDay() === 2 || date.getDay() === 6 || date.getDate() % 3 === 0);
    return runDay && hour >= 10 && hour < 12 ? rnd(900, 1600) : 0;
  }
  let w = dev.base || 0;
  if (dev.spikes && hour % 3 === 0) w += rnd(0, dev.spikes); // compresseur frigo
  if (dev.evening && hour >= 19 && hour < 23) w += rnd(dev.evening * 0.7, dev.evening * 1.2);
  if (dev.day && hour >= 9 && hour < 18) w += rnd(dev.day * 0.5, dev.day * 1.1);
  return w;
}

/** Forme de la journée pour la maison entière (part de chaque demi-heure). */
function houseShape(halfHour, weekend) {
  const h = halfHour / 2;
  let w = 250; // talon
  if (h >= 6.5 && h < 9) w += weekend ? 400 : 900; // matin
  if (h >= 9 && h < 17) w += weekend ? 500 : 250; // journée
  if (h >= 17 && h < 22.5) w += 1200; // soirée
  if (h >= 12 && h < 13.5) w += 600; // midi
  return w * rnd(0.8, 1.25);
}

export function generateDemoData() {
  purgeDemoData();
  const now = new Date();

  const tx = db.transaction(() => {
    for (const dev of DEMO_DEVICES) {
      upsertDevice.run({
        id: dev.id,
        name: dev.name,
        room: '',
        model: 'démo',
        online: 1,
        source: 'demo',
        last_seen: Date.now(),
      });
    }

    // 365 jours de conso quotidienne Linky avec saisonnalité
    for (let i = 365; i >= 1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const month = d.getMonth(); // 0..11
      // hiver haut ; l'amplitude reste modérée pour que le total maison dépasse
      // toujours la somme des prises démo (~3,7 kWh/j), même en été
      const season = 1 + 0.5 * Math.cos(((month - 0.5) / 12) * 2 * Math.PI);
      const weekend = d.getDay() === 0 || d.getDay() === 6 ? 1.15 : 1;
      const kwh = 12 * season * weekend * rnd(0.85, 1.2);
      upsertLinkyDaily.run({ date: localDate(d), wh: Math.round(kwh * 1000), source: 'demo' });
      upsertMaxPower.run({
        date: localDate(d),
        va: Math.round(rnd(2500, 6800)),
        ts: new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.trunc(rnd(7, 21))).getTime(),
        source: 'demo',
      });
    }

    // 14 jours de courbe de charge 30 min
    for (let i = 14; i >= 1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      for (let hh = 0; hh < 48; hh++) {
        const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, hh * 30).getTime();
        upsertLoadCurve.run({
          ts,
          watts: Math.round(houseShape(hh, weekend)),
          interval_min: 30,
          source: 'demo',
        });
      }
    }

    // 90 jours d'énergie horaire par appareil démo
    for (let i = 90; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const lastHour = i === 0 ? now.getHours() : 24;
      for (let h = 0; h < lastHour; h++) {
        const hourStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).getTime();
        for (const dev of DEMO_DEVICES) {
          const wh = devicePower(dev, d, h); // W pendant 1h → Wh
          if (wh > 0.5)
            addHourlyWh.run({ device_id: dev.id, hour_start: hourStart, wh, source: 'demo' });
        }
      }
    }

    // relevés « temps réel » des 30 dernières minutes (pas de 15 s)
    for (let s = 1800; s >= 0; s -= 15) {
      const ts = Date.now() - s * 1000;
      const hour = new Date(ts).getHours();
      for (const dev of DEMO_DEVICES) {
        const w = devicePower(dev, new Date(ts), hour);
        insertReading.run({
          device_id: dev.id,
          ts,
          watts: Math.round(w * 10) / 10,
          volts: Math.round(rnd(228, 237) * 10) / 10,
          amps: Math.round((w / 232) * 100) / 100,
          source: 'demo',
        });
      }
    }
  });
  tx();
}

function localDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Un « battement » temps réel en mode démo : insère et retourne un relevé par appareil. */
export function demoTick() {
  const ts = Date.now();
  const hour = new Date(ts).getHours();
  const readings = [];
  for (const dev of DEMO_DEVICES) {
    const w = Math.round(devicePower(dev, new Date(ts), hour) * 10) / 10;
    const reading = {
      device_id: dev.id,
      ts,
      watts: w,
      volts: Math.round(rnd(228, 237) * 10) / 10,
      amps: Math.round((w / 232) * 100) / 100,
      source: 'demo',
    };
    insertReading.run(reading);
    addHourlyWh.run({
      device_id: dev.id,
      hour_start: new Date(new Date(ts).setMinutes(0, 0, 0)).getTime(),
      wh: (w * 10) / 3600, // 10 s de puissance → Wh
      source: 'demo',
    });
    readings.push({
      deviceId: dev.id,
      name: dev.name,
      ts,
      watts: w,
      volts: reading.volts,
      amps: reading.amps,
      via: 'demo',
    });
  }
  return readings;
}
