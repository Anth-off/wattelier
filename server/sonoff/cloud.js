import crypto from 'node:crypto';
import WebSocket from 'ws';

/**
 * Client cloud eWeLink v2 — même protocole que l'app officielle
 * (transcrit du projet open-source SonoffLAN, protocole documenté par CoolKit :
 * https://coolkit-technologies.github.io/eWeLink-API/)
 */

const APP_ID = 'R8Oq3y0eSZSYdKccHlrQzT1ACCOUT9Gv';
const APP_SECRET = '1ve5Qk9GXfUhKAn1svnKwpAlxXkMarru';

const API = {
  cn: 'https://cn-apia.coolkit.cn',
  as: 'https://as-apia.coolkit.cc',
  us: 'https://us-apia.coolkit.cc',
  eu: 'https://eu-apia.coolkit.cc',
};
const DISPATCH = {
  cn: 'https://cn-dispa.coolkit.cn/dispatch/app',
  as: 'https://as-dispa.coolkit.cc/dispatch/app',
  us: 'https://us-dispa.coolkit.cc/dispatch/app',
  eu: 'https://eu-dispa.coolkit.cc/dispatch/app',
};

function sign(body) {
  return crypto.createHmac('sha256', APP_SECRET).update(body).digest('base64');
}

/** fetch avec délai limite : une requête qui gèle ne doit jamais bloquer la collecte. */
function fetchT(url, options = {}, timeoutMs = 15_000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

export class EwelinkCloud {
  constructor({ email, password, region = 'eu', countryCode = '+33' }) {
    this.email = email;
    this.password = password;
    this.region = region;
    this.countryCode = countryCode;
    this.auth = null;
    this.ws = null;
    this.wsOnline = false;
    this.onUpdate = null; // callback({deviceid, params})
    this.onOnline = null; // callback(deviceid, bool)
    this._stopped = false;
    this._seq = Date.now();
  }

  async login() {
    const payload = { password: this.password, countryCode: this.countryCode };
    if (this.email.includes('@')) payload.email = this.email;
    else payload.phoneNumber = this.email.startsWith('+') ? this.email : '+' + this.email;
    const body = JSON.stringify(payload);
    const headers = {
      Authorization: 'Sign ' + sign(body),
      'Content-Type': 'application/json',
      'X-CK-Appid': APP_ID,
    };

    let resp = await (
      await fetchT(`${API[this.region]}/v2/user/login`, { method: 'POST', body, headers })
    ).json();
    if (resp.error === 10004) {
      // mauvaise région par défaut → le serveur indique la bonne
      this.region = resp.data.region;
      resp = await (
        await fetchT(`${API[this.region]}/v2/user/login`, { method: 'POST', body, headers })
      ).json();
    }
    if (resp.error !== 0) {
      throw new Error(`Login eWeLink refusé (code ${resp.error}) : ${resp.msg || '?'}`);
    }
    this.auth = resp.data;
    return this.auth;
  }

  get headers() {
    return { Authorization: 'Bearer ' + this.auth.at, 'X-CK-Appid': APP_ID };
  }

  /** Liste des appareils du compte (avec devicekey, nécessaire au déchiffrement LAN). */
  async getDevices() {
    const r = await fetchT(`${API[this.region]}/v2/device/thing?num=0`, { headers: this.headers });
    const resp = await r.json();
    if (resp.error !== 0) throw new Error(`device/thing → ${resp.error} ${resp.msg || ''}`);
    return resp.data.thingList.map((i) => i.itemData).filter((d) => d && d.deviceid);
  }

  /** Connexion WebSocket : reçoit les changements d'état (switch, online...) en continu. */
  async connectWs() {
    const r = await fetchT(DISPATCH[this.region], { headers: this.headers });
    const { domain, port } = await r.json();

    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(`wss://${domain}:${port}/api/ws`);
      this.ws.on('open', () => {
        const ts = Date.now() / 1000;
        this.ws.send(
          JSON.stringify({
            action: 'userOnline',
            at: this.auth.at,
            apikey: this.auth.user.apikey,
            appid: APP_ID,
            nonce: String(Math.trunc(ts / 100)),
            ts: Math.trunc(ts),
            userAgent: 'app',
            sequence: String(Math.trunc(ts * 1000)),
            version: 8,
          }),
        );
      });
      this.ws.once('message', (raw) => {
        try {
          const resp = JSON.parse(raw.toString());
          if (resp.error && resp.error !== 0) {
            reject(new Error(`Handshake WS refusé : ${JSON.stringify(resp)}`));
            return;
          }
          const hb = resp?.config?.hbInterval;
          if (resp?.config?.hb && hb) {
            this._pingTimer = setInterval(() => {
              if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('ping');
            }, hb * 1000);
          }
          this.wsOnline = true;
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      this.ws.on('error', reject);
    });

    this.ws.on('message', (raw) => {
      const text = raw.toString();
      if (text === 'pong') return;
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (msg.action === 'update' && msg.params && this.onUpdate) {
        this.onUpdate({ deviceid: msg.deviceid, params: msg.params });
      } else if (msg.action === 'sysmsg' && msg.params && 'online' in msg.params) {
        this.onOnline?.(msg.deviceid, Boolean(msg.params.online));
      } else if (!msg.action && msg.params && msg.deviceid && this.onUpdate) {
        // réponse à une query
        this.onUpdate({ deviceid: msg.deviceid, params: msg.params });
      }
    });
    this.ws.on('close', () => {
      this.wsOnline = false;
      clearInterval(this._pingTimer);
      if (!this._stopped) this._scheduleReconnect();
    });
    this.ws.on('error', () => {});
  }

  _scheduleReconnect() {
    this._fails = (this._fails || 0) + 1;
    const delay = Math.min(15_000 * 2 ** (this._fails - 1), 15 * 60_000);
    setTimeout(async () => {
      try {
        if (!this.auth) await this.login();
        await this.connectWs();
        this._fails = 0;
      } catch {
        this.auth = this._fails > 3 ? null : this.auth; // re-login après plusieurs échecs
        this._scheduleReconnect();
      }
    }, delay).unref();
  }

  /**
   * Change l'état d'un appareil via l'API REST (fiable même sans WebSocket).
   * Utilisé pour le pilotage on/off depuis le dashboard.
   */
  async setDeviceStatus(device, params) {
    const r = await fetchT(`${API[this.region]}/v2/device/thing/status`, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 1, id: device.deviceid, params }),
    });
    const resp = await r.json();
    if (resp.error !== 0) throw new Error(`thing/status → ${resp.error} ${resp.msg || ''}`);
    return true;
  }

  /**
   * Envoie une commande « update » à un appareil via WS. Sert aussi à demander
   * l'historique de conso ({hundredDaysKwh:'get'}, {getHoursKwh:{...}}) : la
   * réponse arrive en push par onUpdate.
   */
  updateDevice(device, params) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        action: 'update',
        apikey: device.apikey,
        selfApikey: this.auth.user.apikey,
        deviceid: device.deviceid,
        params,
        userAgent: 'app',
        sequence: String(this._seq++),
      }),
    );
  }

  /** Interroge l'état d'un appareil via WS (réponse asynchrone par onUpdate). */
  queryDevice(device) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        action: 'query',
        apikey: device.apikey,
        selfApikey: this.auth.user.apikey,
        deviceid: device.deviceid,
        params: [],
        userAgent: 'app',
        sequence: String(this._seq++),
      }),
    );
  }

  stop() {
    this._stopped = true;
    clearInterval(this._pingTimer);
    try {
      this.ws?.close();
    } catch {
      /* déjà fermé */
    }
  }
}
