'use strict';

import {
  getKilpailu,
  listLuokat,
  listRyppaanKilpailut,
  listKilpailunOsallistujaTunnukset,
  lisaaOsallistujat,
  getLaji,
} from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';
import { hevostaRatsastajaaKohtiLuokassa, jasennaIlmoittautuminen, ilmoittautuminenPaattynyt } from '../../../lib/saannot.js';
import { turnstileOk } from '../../../lib/turnstile.js';

// Lomakkeella (ks. lib/html.js:n ilmoittautumislomakeHtml) jokaisella kilpailun luokalla on
// oma "nimi_<luokkaId>"-monirivinen textarea - kaikki luokat ovat siis auki samalla kertaa,
// jotta useaan luokkaan (esim. usealla hevosella) voi ilmoittautua yhdellä lomakkeen
// lähetyksellä sen sijaan että jokaista luokkaa varten pitäisi lähettää lomake erikseen.
// Tyhjäksi jätetyt luokat ohitetaan hiljaa. Jokaisen rivin on noudatettava
// jasennaIlmoittautuminen()-funktion vaatimaa muotoa (ks. lib/saannot.js) - yksi
// hevonen/ratsastaja per rivi.
//
// Kisaryppään (ks. migrations/0022_kisaryppaat.sql) kilpailussa lomake kertoo lisäksi mihin
// ryppään kilpailuihin ilmoittautuminen tehdään (rypas_valinta = 'kaikki' tai 'valitut' +
// rypas_kisa-id:t). Samat rivit ilmoitetaan jokaisen valitun kilpailun samannimiseen luokkaan.
// Kilpailut joiden ilmoittautuminen on jo päättynyt jätetään pois, ja jos luokka on jossain
// ryppään kilpailussa täynnä, se luokka ohitetaan siinä kilpailussa (ohitetut näytetään
// kutsusivulla, ks. "ohitetut"-parametri). Muut säännöt tarkistetaan kilpailukohtaisesti - jos
// yksikin kilpailu hylkää lähetyksen, mitään ei tallenneta.

// Palauttaa kilpailut joihin ilmoittaudutaan, tai virhetekstin.
async function valitseKohdekilpailut(db, kilpailu, data) {
  const valinta = (data.get('rypas_valinta') || '').toString();
  if (!kilpailu.rypas_id || !valinta) return [kilpailu];
  const avoimet = (await listRyppaanKilpailut(db, kilpailu.rypas_id)).filter(
    (k) => k.tila === 'avoinna' && !ilmoittautuminenPaattynyt(k)
  );
  if (valinta === 'kaikki') return avoimet;
  const valitut = new Set(data.getAll('rypas_kisa').map((v) => v.toString()));
  const kohteet = avoimet.filter((k) => valitut.has(String(k.id)));
  return kohteet.length ? kohteet : 'Valitse vähintään yksi kisaryppään kilpailu.';
}

// Tunnusten vertailu kuten aiemmissa SQL-kyselyissä (LOWER(TRIM(...))); NULL ei täsmää mihinkään.
const normalisoi = (t) => (t == null ? null : String(t).trim().toLowerCase());

// Kilpailun nykyiset osallistujat koottuna laskureiksi yhdestä kyselystä (ks.
// lib/db.js:n listKilpailunOsallistujaTunnukset) - säännöt tarkistetaan muistissa, ettei
// jokaiselle riville tehdä omia kyselyjä (Workerin API-kutsuraja).
async function haeTilanne(db, kilpailuId) {
  const osallistujia = new Map();
  const hevonenLuokassa = new Set();
  const ratsastajanHevoset = new Map();
  const hevosenLahdot = new Map();
  for (const r of await listKilpailunOsallistujaTunnukset(db, kilpailuId)) {
    const luokka = String(r.luokka_id);
    osallistujia.set(luokka, (osallistujia.get(luokka) || 0) + 1);
    const vh = normalisoi(r.vh_tunnus);
    const vrl = normalisoi(r.vrl_tunnus);
    if (vh != null) {
      hevonenLuokassa.add(`${luokka}|${vh}`);
      hevosenLahdot.set(vh, (hevosenLahdot.get(vh) || 0) + 1);
    }
    if (vrl != null) {
      const avain = `${luokka}|${vrl}`;
      ratsastajanHevoset.set(avain, (ratsastajanHevoset.get(avain) || 0) + 1);
    }
  }
  return {
    osallistujia: (luokkaId) => osallistujia.get(String(luokkaId)) || 0,
    onkoHevonenLuokassa: (luokkaId, vh) => hevonenLuokassa.has(`${luokkaId}|${normalisoi(vh)}`),
    ratsastajanHevoset: (luokkaId, vrl) => ratsastajanHevoset.get(`${luokkaId}|${normalisoi(vrl)}`) || 0,
    hevosenLahdot: (vh) => hevosenLahdot.get(normalisoi(vh)) || 0,
  };
}

// Yhden kilpailun tietokantaan perustuvat säännöt. Palauttaa { status, teksti } jos lähetys
// hylätään, muuten null.
function tarkistaSaannot(tilanne, kilpailu, luokkaMerkinnat, villiLaji, ilmanTunnuksia) {
  for (const { luokka, merkinnat } of luokkaMerkinnat) {
    if (luokka.max_osallistujia != null) {
      const maara = tilanne.osallistujia(luokka.id);
      if (maara + merkinnat.length > luokka.max_osallistujia) {
        return {
          status: 409,
          teksti:
            `Luokassa "${luokka.nimi}" on tilaa ${Math.max(0, luokka.max_osallistujia - maara)} osallistujalle, mutta ` +
            `yritit ilmoittaa ${merkinnat.length}.`,
        };
      }
    }

    if (ilmanTunnuksia) continue;

    for (const m of merkinnat) {
      if (tilanne.onkoHevonenLuokassa(luokka.id, m.vhTunnus)) {
        return {
          status: 409,
          teksti:
            `Hevonen (${m.vhTunnus}) on jo ilmoitettu luokkaan "${luokka.nimi}" - sama hevonen voi olla luokassa ` +
            'vain kerran.',
        };
      }
    }

    if (luokka.max_osallistujia != null) {
      const raja = hevostaRatsastajaaKohtiLuokassa(villiLaji, luokka.max_osallistujia);
      const rajaSelitys = villiLaji
        ? `tähän luokkaan saa tuoda enintään ${raja} hevosta samalta ratsastajalta`
        : `yksi ratsastaja saa tuoda enintään 10 % luokan osallistujamäärästä (${luokka.max_osallistujia} osallistujaa → enintään ${raja} hevosta)`;
      const uusiaRatsastajaltaLaskuri = new Map();
      for (const m of merkinnat) {
        const nykyinen = tilanne.ratsastajanHevoset(luokka.id, m.vrlTunnus);
        const uusiaSamaltaRatsastajalta = (uusiaRatsastajaltaLaskuri.get(m.vrlTunnus) || 0) + 1;
        uusiaRatsastajaltaLaskuri.set(m.vrlTunnus, uusiaSamaltaRatsastajalta);
        if (nykyinen + uusiaSamaltaRatsastajalta > raja) {
          return {
            status: 409,
            teksti:
              `Ratsastajalla (${m.vrlTunnus}) olisi tämän lähetyksen jälkeen ${nykyinen + uusiaSamaltaRatsastajalta} ` +
              `hevosta luokassa "${luokka.nimi}" - ${rajaSelitys}.`,
          };
        }
      }
    }
  }

  // kilpailu.max_lahtoja_per_hevonen rajoittaa hevosen lähtöjen (luokkien) kokonaismäärää koko
  // kilpailussa, yli kaikkien luokkien - koska tämä lähetys voi koskea useampaa luokkaa yhtä
  // aikaa, lasketaan ensin hevoskohtainen kokonaissumma tämän lähetyksen kaikista luokista.
  if (kilpailu.max_lahtoja_per_hevonen != null && !ilmanTunnuksia) {
    const uusiaLahtojaHevoselta = new Map();
    for (const { merkinnat } of luokkaMerkinnat) {
      for (const m of merkinnat) {
        uusiaLahtojaHevoselta.set(m.vhTunnus, (uusiaLahtojaHevoselta.get(m.vhTunnus) || 0) + 1);
      }
    }
    for (const [vhTunnus, uusia] of uusiaLahtojaHevoselta) {
      const lahtoja = tilanne.hevosenLahdot(vhTunnus);
      if (lahtoja + uusia > kilpailu.max_lahtoja_per_hevonen) {
        return {
          status: 409,
          teksti:
            `Hevonen (${vhTunnus}) on jo ilmoitettu ${lahtoja} lähtöön tässä kilpailussa, ja tämä lähetys lisäisi ` +
            `${uusia} lähtöä lisää - sallittu enimmäismäärä on ${kilpailu.max_lahtoja_per_hevonen}.`,
        };
      }
    }
  }

  return null;
}

export async function onRequestPost({ request, params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu || kilpailu.tila !== 'avoinna' || ilmoittautuminenPaattynyt(kilpailu)) {
    return new Response('Ilmoittautuminen ei ole auki tälle kilpailulle.', { status: 400 });
  }

  const data = await request.formData();

  // Bottitarkistus (ks. lib/turnstile.js) - vain kun TURNSTILE_SECRET_KEY on asetettu eli
  // käytännössä vain tuotannossa. Tehdään heti lomakkeen luvun jälkeen, ennen mitään
  // tietokantatyötä, jotta spämmi hylätään mahdollisimman halvalla.
  if (env.TURNSTILE_SECRET_KEY) {
    const token = (data.get('cf-turnstile-response') || '').toString();
    const ok = await turnstileOk(env.TURNSTILE_SECRET_KEY, token, request.headers.get('CF-Connecting-IP'));
    if (!ok) {
      return new Response('Bottitarkistus epäonnistui. Lataa sivu uudelleen ja yritä uudelleen.', { status: 400 });
    }
  }

  const palaaRaaka = (data.get('palaa') || '').toString().trim();
  // Vain oman sivuston juuresta alkava polku hyväksytään paluuosoitteeksi (ei "//host"-alkuisia
  // eikä ulkoisia URL:eja), jotta lomake ei toimi avoimena uudelleenohjauksena.
  const palaa = /^\/(?!\/)/.test(palaaRaaka) ? palaaRaaka : `/kilpailut/${kilpailu.id}`;

  const luokat = await listLuokat(env.DB, kilpailu.id);

  // getLaji palauttaa null VRL:n omille jaoksille (id 1-6, ei riviä lajit-taulussa) - vain
  // villeillä lajeilla on oma kiinteä hevosta/ratsastaja/luokka-raja (ks.
  // migrations/0014_laji_saannot.sql ja lib/saannot.js:n hevostaRatsastajaaKohtiLuokassa).
  // Ryppään kilpailut ovat aina samaa lajia, joten laji haetaan kerran.
  const villiLaji = await getLaji(env.DB, kilpailu.jaos);
  // Tunnukseton laji (ks. migrations/0018_laji_ilman_tunnuksia.sql): rivit hyväksytään
  // vapaamuotoisina, eikä tunnuksiin perustuvia tarkistuksia (sama hevonen kahdesti,
  // hevosta/ratsastaja, lähtöä/hevonen) tehdä - vain luokan osallistujaraja pätee.
  const ilmanTunnuksia = Boolean(villiLaji && villiLaji.ilman_tunnuksia);

  // Jäsennä ja muotovalidoi jokaisen täytetyn luokan rivit ennen mitään tietokantatarkistuksia
  // - koko lähetys hylätään yhdessä, ettei osa riveistä tallennu ja osa ei.
  const lomakeMerkinnat = [];
  for (const luokka of luokat) {
    const rivit = (data.get(`nimi_${luokka.id}`) || '')
      .toString()
      .split(/\r?\n/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    if (rivit.length === 0) continue;

    const merkinnat = [];
    for (const [i, rivi] of rivit.entries()) {
      if (ilmanTunnuksia) {
        merkinnat.push({ nimi: rivi, vrlTunnus: null, vhTunnus: null });
        continue;
      }
      const jasennetty = jasennaIlmoittautuminen(rivi);
      if (!jasennetty) {
        return new Response(
          `Luokka "${luokka.nimi}", rivi ${i + 1} ("${rivi}") on väärässä muodossa. Käytä muotoa "Ratsastajan nimi ` +
            '(VRL-123456) - Hevosen nimi VH12-345-6789", esim. "Matti Meikäläinen (VRL-123456) - Ihka Ihana ' +
            'VH12-345-6789" - yksi hevonen/ratsastaja per rivi.',
          { status: 400 }
        );
      }
      merkinnat.push({ nimi: rivi, vrlTunnus: jasennetty.vrlTunnus, vhTunnus: jasennetty.vhTunnus });
    }

    // Sama hevonen kahdesti samassa luokassa samassa lähetyksessä on sama virhe kuin jo
    // tietokannassa oleva.
    const nahdytVhTunnukset = new Set();
    for (const m of ilmanTunnuksia ? [] : merkinnat) {
      if (nahdytVhTunnukset.has(m.vhTunnus)) {
        return new Response(
          `Luokka "${luokka.nimi}": hevonen (${m.vhTunnus}) on merkitty useammin kuin kerran samassa lähetyksessä.`,
          { status: 400 }
        );
      }
      nahdytVhTunnukset.add(m.vhTunnus);
    }

    lomakeMerkinnat.push({ luokka, merkinnat });
  }

  if (lomakeMerkinnat.length === 0) {
    return new Response('Nimi puuttuu.', { status: 400 });
  }

  const kohteet = await valitseKohdekilpailut(env.DB, kilpailu, data);
  if (typeof kohteet === 'string') {
    return new Response(kohteet, { status: 400 });
  }

  // Ryppään kilpailujen luokat yhdistetään nimen perusteella - ryppään kilpailut luodaan samoilla
  // luokilla, mutta järjestäjä voi muokata yksittäisen kilpailun luokkia jälkikäteen.
  const rypasIlmoittautuminen = kohteet.length > 1;
  const lisattavat = [];
  // Ryppään kilpailujen luokat joihin ei ilmoitettu, koska niissä ei ollut tilaa kaikille riveille.
  const ohitetut = [];
  for (const kohde of kohteet) {
    const etuliite = rypasIlmoittautuminen ? `${kohde.nimi}: ` : '';
    const kohdeLuokat = kohde.id === kilpailu.id ? luokat : await listLuokat(env.DB, kohde.id);
    const tilanne = await haeTilanne(env.DB, kohde.id);
    const luokkaMerkinnat = [];
    for (const { luokka, merkinnat } of lomakeMerkinnat) {
      const kohdeLuokka = kohdeLuokat.find((l) => l.nimi.trim() === luokka.nimi.trim());
      if (!kohdeLuokka) {
        return new Response(`${etuliite}kilpailussa ei ole luokkaa "${luokka.nimi}".`, { status: 409 });
      }
      if (
        rypasIlmoittautuminen &&
        kohdeLuokka.max_osallistujia != null &&
        tilanne.osallistujia(kohdeLuokka.id) + merkinnat.length > kohdeLuokka.max_osallistujia
      ) {
        ohitetut.push(kohdeLuokka.id);
        continue;
      }
      luokkaMerkinnat.push({ luokka: kohdeLuokka, merkinnat });
    }
    if (luokkaMerkinnat.length === 0) continue;

    const virhe = tarkistaSaannot(tilanne, kohde, luokkaMerkinnat, villiLaji, ilmanTunnuksia);
    if (virhe) {
      return new Response(`${etuliite}${virhe.teksti}`, { status: virhe.status });
    }
    lisattavat.push(...luokkaMerkinnat);
  }

  if (lisattavat.length === 0) {
    return new Response('Valittujen kilpailujen luokissa ei ole tilaa näille osallistujille.', { status: 409 });
  }

  // Kaikki rivit yhtenä batchina: yksi API-kutsu, ja joko kaikki tallentuvat tai ei mitään.
  await lisaaOsallistujat(
    env.DB,
    lisattavat.flatMap(({ luokka, merkinnat }) =>
      merkinnat.map((m) => ({ luokkaId: luokka.id, nimi: m.nimi, vrlTunnus: m.vrlTunnus, vhTunnus: m.vhTunnus }))
    )
  );

  // Ohitetut välitetään kutsusivulle pelkkinä luokka-id:inä - sivu kokoaa ilmoituksen tekstin
  // kannasta, ettei URL:iin voi kirjoittaa omaa tekstiä sivulla näytettäväksi.
  return uudelleenohjaus(ohitetut.length ? `${palaa}${palaa.includes('?') ? '&' : '?'}ohitetut=${ohitetut.join(',')}` : palaa);
}
