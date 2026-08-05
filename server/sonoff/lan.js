import os from 'node:os';
import mdns from 'multicast-dns';
import { encryptPayload, decryptData } from './crypto.js';

/**
 * Accès LAN aux appareils Sonoff (mode eWeLink LAN) :
 * - les appareils s'annoncent en mDNS `_ewelink._tcp.local` avec leurs données
 *   d'état chiffrées (AES, clé dérivée du devicekey) dans les enregistrements TXT ;
 * - on peut leur envoyer des commandes en HTTP local (port 8081, /zeroconf/<cmd>).
 * Transcrit du protocole utilisé par le projet SonoffLAN.
 */

const SERVICE = '_ewelink._tcp.local';
const VPN_INTERFACE = /tailscale|nord|surfshark|openvpn|wireguard|wintun|vpn|hamachi|zerotier/i;

function ipv4ToInt(ip) {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return null;
  return parts.reduce((out, n) => ((out << 8) | n) >>> 0, 0);
}

function sameSubnet(a, b, netmask) {
  const ai = ipv4ToInt(a);
  const bi = ipv4ToInt(b);
  const mask = ipv4ToInt(netmask);
  return ai !== null && bi !== null && mask !== null && (ai & mask) === (bi & mask);
}

export class SonoffLan {
  /**
   * @param {(deviceid: string) => string|undefined} getKey  devicekey par deviceid
   * @param {(deviceid: string, params: object, host: string) => void} onParams
   * @param {(deviceid: string, host: string) => void} [onHost]  IP découverte/changée (à persister)
   */
  constructor(getKey, onParams, onHost) {
    this.getKey = getKey;
    this.onParams = onParams;
    this.onHost = onHost;
    this.hosts = new Map(); // deviceid → "ip:port"
    this.lastSeen = new Map(); // deviceid → dernière réponse LAN confirmée
    this.instances = [];
  }

  start() {
    // Sous Windows, plusieurs sockets mDNS ouvertes d'abord sur des VPN peuvent
    // capter le port multicast au détriment de l'interface Ethernet/Wi-Fi. On
    // privilégie donc l'interface située sur le même sous-réseau que les IP déjà
    // mémorisées des prises, puis les interfaces non-VPN en repli.
    const knownIps = [...this.hosts.values()].map((host) => host.split(':')[0]);
    const interfaces = Object.entries(os.networkInterfaces()).flatMap(([name, entries]) =>
      (entries || [])
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .map((i) => ({ ...i, name })),
    );
    const matching = interfaces.filter((i) =>
      knownIps.some((host) => sameSubnet(i.address, host, i.netmask)),
    );
    const nonVpn = interfaces.filter((i) => !VPN_INTERFACE.test(i.name));
    const selected = matching.length ? matching : nonVpn.length ? nonVpn : interfaces;
    const addrs = [...new Set(selected.map((i) => i.address))];
    console.log(`[sonoff] mDNS sur ${addrs.join(', ') || 'interface par défaut'}`);

    this.instances = (addrs.length ? addrs : [undefined]).map((addr) => {
      const m = mdns(addr ? { interface: addr } : {});
      m.on('response', (packet, rinfo) => this._onResponse(packet, rinfo));
      m.on('error', () => {}); // interface sans multicast (VPN…) : on ignore
      return m;
    });
    const query = () => {
      for (const m of this.instances) {
        try {
          m.query({ questions: [{ name: SERVICE, type: 'PTR' }] });
        } catch {
          /* interface morte */
        }
      }
    };
    query();
    this._queryTimer = setInterval(query, 60_000);
  }

  stop() {
    clearInterval(this._queryTimer);
    for (const m of this.instances) {
      try {
        m.destroy();
      } catch {
        /* déjà fermée */
      }
    }
  }

  /** Précharge les adresses connues (persistées en base) sans attendre le mDNS. */
  setHosts(entries) {
    for (const [deviceid, host] of entries) {
      if (host && !this.hosts.has(deviceid)) this.hosts.set(deviceid, host);
    }
  }

  _onResponse(packet, rinfo) {
    const records = [...(packet.answers || []), ...(packet.additionals || [])];
    const txts = records.filter((r) => r.type === 'TXT' && /^ewelink/i.test(r.name));
    for (const txt of txts) {
      try {
        const props = {};
        for (const entry of txt.data || []) {
          const s = Buffer.isBuffer(entry) ? entry.toString('utf8') : String(entry);
          const i = s.indexOf('=');
          if (i > 0) props[s.slice(0, i)] = s.slice(i + 1);
        }
        const deviceid = props.id || txt.name.slice(8, 18);
        if (!deviceid) continue;

        // adresse : enregistrement SRV/A si présent, sinon l'émetteur du paquet
        const srv = records.find((r) => r.type === 'SRV' && r.name === txt.name);
        const a = records.find(
          (r) => r.type === 'A' && (!srv?.data?.target || r.name === srv.data.target),
        );
        const ip = a?.data || rinfo.address;
        const port = srv?.data?.port || 8081;
        const host = `${ip}:${port}`;
        this.lastSeen.set(deviceid, Date.now());
        if (this.hosts.get(deviceid) !== host) {
          this.hosts.set(deviceid, host);
          this.onHost?.(deviceid, host);
        }

        const raw = ['data1', 'data2', 'data3', 'data4'].map((k) => props[k] || '').join('');
        if (!raw) continue;

        let params;
        if (props.encrypt) {
          const key = this.getKey(deviceid);
          if (!key) continue; // appareil inconnu, indéchiffrable
          params = decryptData(raw, props.iv, key);
        } else {
          params = JSON.parse(raw);
        }
        this.onParams(deviceid, params, this.hosts.get(deviceid));
      } catch {
        // trame illisible (autre appareil, clé changée...) → ignorée
      }
    }
  }

  /**
   * Envoie une commande locale. Une réponse chiffrée (état complet) est
   * transmise à onParams. Retourne true si l'appareil a répondu.
   */
  async send(deviceid, command, data = {}, timeoutMs = 3000) {
    const host = this.hosts.get(deviceid);
    const key = this.getKey(deviceid);
    if (!host || !key) return false;

    let payload = { sequence: String(Date.now()), deviceid, selfApikey: '123', data };
    payload = encryptPayload(payload, key);

    // le serveur web des Sonoff est mono-requête → petites tentatives en cas de reset
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`http://${host}/zeroconf/${command}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Connection: 'close' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
        this.lastSeen.set(deviceid, Date.now());
        if ((res.headers.get('content-type') || '').includes('text/html'))
          return command === 'getState';
        const resp = await res.json();
        if (resp.error === 0) {
          if (resp.iv && resp.data) {
            try {
              this.onParams(deviceid, decryptData(resp.data, resp.iv, key), host);
            } catch {
              /* réponse indéchiffrable */
            }
          }
          return true;
        }
        return command === 'getState';
      } catch (err) {
        if (err.code === 'ECONNRESET' || err.cause?.code === 'ECONNRESET') {
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }
        return false;
      }
    }
    return false;
  }

  /** Nombre de prises réellement vues sur le LAN récemment (pas les IP en cache). */
  activeCount(maxAgeMs = 120_000) {
    const cutoff = Date.now() - maxAgeMs;
    return [...this.lastSeen.values()].filter((ts) => ts >= cutoff).length;
  }
}
