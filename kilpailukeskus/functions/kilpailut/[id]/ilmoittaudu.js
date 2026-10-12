'use strict';

import {
  getKilpailu,
  listLuokat,
  laskeOsallistujat,
  laskeHevosenLahdot,
  onkoHevonenLuokassa,
  laskeRatsastajanHevoset,
  lisaaOsallistuja,
  getLaji,
} from '../../../lib/db.js';
import { uudelleenohjaus } from '../../../lib/html.js';
import { hevostaRatsastajaaKohtiLuokassa, jasennaIlmoittautuminen } from '../../../lib/saannot.js';
import { turnstileOk } from '../../../lib/turnstile.js';

// Lomakkeella (ks. lib/html.js:n ilmoittautumislomakeHtml) jokaisella kilpailun luokalla on
// oma "nimi_<luokkaId>"-monirivinen textarea - kaikki luokat ovat siis auki samalla kertaa,
// jotta useaan luokkaan (esim. usealla hevosella) voi ilmoittautua yhdellä lomakkeen
// lähetyksellä sen sijaan että jokaista luokkaa varten pitäisi lähettää lomake erikseen.
// Tyhjäksi jätetyt luokat ohitetaan hiljaa. Jokaisen rivin on noudatettava
// jasennaIlmoittautuminen()-funktion vaatimaa muotoa (ks. lib/saannot.js) - yksi
// hevonen/ratsastaja per rivi.

export async function onRequestPost({ request, params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu || kilpailu.tila !== 'avoinna') {
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
  const villiLaji = await getLaji(env.DB, kilpailu.jaos);
  // Tunnukseton laji (ks. migrations/0018_laji_ilman_tunnuksia.sql): rivit hyväksytään
  // vapaamuotoisina, eikä tunnuksiin perustuvia tarkistuksia (sama hevonen kahdesti,
  // hevosta/ratsastaja, lähtöä/hevonen) tehdä - vain luokan osallistujaraja pätee.
  const ilmanTunnuksia = Boolean(villiLaji && villiLaji.ilman_tunnuksia);

  // Jäsennä ja muotovalidoi jokaisen täytetyn luokan rivit ennen mitään tietokantatarkistuksia
  // - koko lähetys hylätään yhdessä, ettei osa riveistä tallennu ja osa ei.
  const luokkaMerkinnat = [];
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

    luokkaMerkinnat.push({ luokka, merkinnat });
  }

  if (luokkaMerkinnat.length === 0) {
    return new Response('Nimi puuttuu.', { status: 400 });
  }

  for (const { luokka, merkinnat } of luokkaMerkinnat) {
    if (luokka.max_osallistujia != null) {
      const maara = await laskeOsallistujat(env.DB, luokka.id);
      if (maara + merkinnat.length > luokka.max_osallistujia) {
        return new Response(
          `Luokassa "${luokka.nimi}" on tilaa ${Math.max(0, luokka.max_osallistujia - maara)} osallistujalle, mutta ` +
            `yritit ilmoittaa ${merkinnat.length}.`,
          { status: 409 }
        );
      }
    }

    if (ilmanTunnuksia) continue;

    for (const m of merkinnat) {
      if (await onkoHevonenLuokassa(env.DB, luokka.id, m.vhTunnus)) {
        return new Response(
          `Hevonen (${m.vhTunnus}) on jo ilmoitettu luokkaan "${luokka.nimi}" - sama hevonen voi olla luokassa ` +
            'vain kerran.',
          { status: 409 }
        );
      }
    }

    if (luokka.max_osallistujia != null) {
      const raja = hevostaRatsastajaaKohtiLuokassa(villiLaji, luokka.max_osallistujia);
      const rajaSelitys = villiLaji
        ? `tähän luokkaan saa tuoda enintään ${raja} hevosta samalta ratsastajalta`
        : `yksi ratsastaja saa tuoda enintään 10 % luokan osallistujamäärästä (${luokka.max_osallistujia} osallistujaa → enintään ${raja} hevosta)`;
      const uusiaRatsastajaltaLaskuri = new Map();
      for (const m of merkinnat) {
        const nykyinen = await laskeRatsastajanHevoset(env.DB, luokka.id, m.vrlTunnus);
        const uusiaSamaltaRatsastajalta = (uusiaRatsastajaltaLaskuri.get(m.vrlTunnus) || 0) + 1;
        uusiaRatsastajaltaLaskuri.set(m.vrlTunnus, uusiaSamaltaRatsastajalta);
        if (nykyinen + uusiaSamaltaRatsastajalta > raja) {
          return new Response(
            `Ratsastajalla (${m.vrlTunnus}) olisi tämän lähetyksen jälkeen ${nykyinen + uusiaSamaltaRatsastajalta} ` +
              `hevosta luokassa "${luokka.nimi}" - ${rajaSelitys}.`,
            { status: 409 }
          );
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
      const lahtoja = await laskeHevosenLahdot(env.DB, kilpailu.id, vhTunnus);
      if (lahtoja + uusia > kilpailu.max_lahtoja_per_hevonen) {
        return new Response(
          `Hevonen (${vhTunnus}) on jo ilmoitettu ${lahtoja} lähtöön tässä kilpailussa, ja tämä lähetys lisäisi ` +
            `${uusia} lähtöä lisää - sallittu enimmäismäärä on ${kilpailu.max_lahtoja_per_hevonen}.`,
          { status: 409 }
        );
      }
    }
  }

  for (const { luokka, merkinnat } of luokkaMerkinnat) {
    for (const m of merkinnat) {
      await lisaaOsallistuja(env.DB, luokka.id, m.nimi, m.vrlTunnus, m.vhTunnus);
    }
  }

  return uudelleenohjaus(palaa);
}
