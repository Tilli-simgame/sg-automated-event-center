'use strict';

/**
 * Hakee yksittäisen hevosen Rate My Pony -ensiarvostelun tulokset suoraan RMP:n
 * rajapinnasta VH-tunnuksella (https://www.ratemypony.fi/api/horses/vh/{VH}). Tuloksia ei
 * tallenneta omaan kantaan - jokainen arvonta ja /rmp-sivun haku kysyy ne RMP:ltä
 * tuoreeltaan, joten uusintarvostelut näkyvät heti.
 *
 * haeHevonenVhTunnuksella() palauttaa olion jonka avaimet ovat samat kuin vanhan
 * rmp_hevoset-taulun sarakkeet (ks. migrations/0011_rmp_hevoset.sql), jotta lib/rmp_arvonta.js:n
 * JAOS_RMP_KOHDAT ja functions/rmp/index.js voivat viitata kohtiin samoilla nimillä.
 */

const RMP_API = 'https://www.ratemypony.fi/api/horses/vh';

function pisteeksi(arvo) {
  if (arvo === undefined || arvo === null || arvo === '') return null;
  const n = Number(arvo);
  return Number.isFinite(n) ? n : null;
}

// Muuntaa rajapinnan vastauksen ({ horse, review }) pisteolioksi, tai palauttaa null jos
// hevosta ei ole vielä arvosteltu (review puuttuu).
function muotoileHevonen(data) {
  const review = data && data.review;
  if (!review) return null;
  const kategoriat = review.categories || {};
  const s = review.stats || {};
  return {
    rmp_id: (data.horse && data.horse.id) ?? null,
    vh_tunnus: (data.horse && data.horse.vh_id) || null,
    nimi: (data.horse && data.horse.name) || null,
    arvosteltu: review.created_at || null,
    luokitus: review.grade || null,
    kokonaispisteet: pisteeksi(review.overall_score),

    rakenne_yleisarvosana: pisteeksi(kategoriat.conformation),
    rakenne_paa_kaula_etuosa: pisteeksi(s.head),
    rakenne_runko_takaosa: pisteeksi(s.body),
    rakenne_jalat_kaviot: pisteeksi(s.legs),

    liikkeet_yleisarvosana: pisteeksi(kategoriat.gaits),
    liikkeet_kaynti: pisteeksi(s.walk),
    liikkeet_ravi: pisteeksi(s.trot),
    liikkeet_laukka: pisteeksi(s.canter),

    luonne_yleisarvosana: pisteeksi(kategoriat.character),
    luonne_rohkeus: pisteeksi(s.courage),
    luonne_kuuliaisuus: pisteeksi(s.obedience),
    luonne_temperamentti: pisteeksi(s.temperament),
    luonne_herkkyys: pisteeksi(s.sensitivity),
    luonne_alykkyys: pisteeksi(s.intelligence),

    taidot_yleisarvosana: pisteeksi(kategoriat.skills),
    taidot_nopeus: pisteeksi(s.speed),
    taidot_kestavyys: pisteeksi(s.endurance),
    taidot_ketteryys: pisteeksi(s.agility),
    taidot_hyppytekniikka: pisteeksi(s.jump),
    taidot_kokoamiskyky: pisteeksi(s.collection),
    taidot_voima: pisteeksi(s.strength),

    ratsastettavuus_ajettavuus: pisteeksi(kategoriat.rideability),
    kaytos_tilaisuudessa: pisteeksi(kategoriat.behaviour),
  };
}

/**
 * @param {string} vhTunnus esim. VH24-017-0123
 * @returns {Promise<object|null>} muotoileHevonen()-olio, tai null jos hevosta ei löydy
 *   RMP:stä (HTTP 404) tai sitä ei ole arvosteltu.
 * @throws kun RMP ei vastaa tai vastaa muulla virheellä - kutsujan (esim. arvonta) ei pidä
 *   silloin tulkita hevosta arvostelemattomaksi, vaan yrittää myöhemmin uudelleen.
 */
async function haeHevonenVhTunnuksella(vhTunnus, { timeoutMs } = {}) {
  const vh = String(vhTunnus || '').trim().toUpperCase();
  if (!vh) return null;

  const ohjaus = new AbortController();
  const kello = setTimeout(() => ohjaus.abort(), timeoutMs || 10000);
  let vastaus;
  try {
    vastaus = await fetch(`${RMP_API}/${encodeURIComponent(vh)}`, {
      signal: ohjaus.signal,
      headers: { Accept: 'application/json' },
    });
  } finally {
    clearTimeout(kello);
  }

  if (vastaus.status === 404) return null;
  if (!vastaus.ok) throw new Error(`RMP-haku epäonnistui (${vh}): HTTP ${vastaus.status}`);
  return muotoileHevonen(await vastaus.json());
}

// Pisteen sanallinen arvosana RMP:n "tietoa-ensiarvostelusta"-sivun asteikolla - käytössä
// mm. hevoshaun tuloksen näyttämiseen (ks. functions/rmp/index.js).
function sanallinenArvosana(pisteet) {
  if (pisteet === null || pisteet === undefined) return null;
  if (pisteet <= 15) return 'Heikko';
  if (pisteet <= 50) return 'Kohtalainen';
  if (pisteet <= 85) return 'Hyvä';
  return 'Erinomainen';
}

export { haeHevonenVhTunnuksella, muotoileHevonen, sanallinenArvosana };
