'use strict';

/**
 * Jaettu ilmoittautumissääntöjen laskenta - käytössä sekä ilmoittautumisen validoinnissa
 * (functions/kilpailut/[id]/ilmoittaudu.js) että kilpailukutsun esikatselussa
 * (functions/[jaos]/[vuosi]/[kuukausi]/[numero].js), jotta kutsulla näytetty luku on aina
 * sama kuin mitä ilmoittautuminen todellisuudessa sallii.
 */

// "Yksi ratsastaja saa tuoda enintään 10 % luokan osallistujamäärästä" (esim. 50
// osallistujan luokkaan enintään 5 hevosta samalta ratsastajalta) - pyöristetään alaspäin,
// mutta sallitaan aina vähintään yksi hevonen per ratsastaja vaikka luokan yläraja olisi pieni.
function ratsastajanMaxHevoset(maxOsallistujia) {
  return Math.max(1, Math.floor(maxOsallistujia * 0.1));
}

// Montako hevosta yksi ratsastaja saa tuoda samaan luokkaan. VRL:n jaoksilla (villiLaji on
// null, koska niillä ei ole riviä lajit-taulussa) VRL:n oma 10 %-sääntö (ratsastajanMaxHevoset
// yllä) - villeillä lajeilla (ks. migrations/0014_laji_saannot.sql) järjestäjän itse asettama
// kiinteä luku sen sijaan, koska villin kilpailun osallistumismuoto voi poiketa VRL:n
// muotoilusta niin paljon ettei prosenttisääntö ole enää mielekäs (ks.
// functions/lajit/[id]/muokkaa-saannot.js).
function hevostaRatsastajaaKohtiLuokassa(villiLaji, maxOsallistujia) {
  return villiLaji ? villiLaji.max_hevosta_ratsastaja_per_luokka : ratsastajanMaxHevoset(maxOsallistujia);
}

// Sijoittuneiden määrä luokan osallistujamäärän mukaan (lähde: sijoittuneet.md) - käytössä
// kilpailukutsun Osallistujat-listauksessa (ks. [jaos]/[vuosi]/[kuukausi]/[numero].js) sen
// lihavoimiseksi ketkä arvonnan (ks. lib/kilpailun_arvonta.js) sijoitusjärjestyksestä ovat
// sijoittuneita. Rajat vastaavat kaavaa floor(sqrt(osallistujienMaara)), mutta pidetään
// eksplisiittisenä taulukkona ettei kaava ja lähdeaineisto pääse eriytymään huomaamatta.
const SIJOITTUNEET_RAJAT = [
  { enintaan: 3, maara: 1 },
  { enintaan: 8, maara: 2 },
  { enintaan: 15, maara: 3 },
  { enintaan: 24, maara: 4 },
  { enintaan: 35, maara: 5 },
  { enintaan: 48, maara: 6 },
  { enintaan: 63, maara: 7 },
  { enintaan: 80, maara: 8 },
  { enintaan: 99, maara: 9 },
  { enintaan: 100, maara: 10 },
];

function sijoittuneidenMaara(osallistujienMaara) {
  const raja = SIJOITTUNEET_RAJAT.find((r) => osallistujienMaara <= r.enintaan);
  return raja ? raja.maara : SIJOITTUNEET_RAJAT[SIJOITTUNEET_RAJAT.length - 1].maara;
}

// Ilmoittautumisen "nimi"-kenttä on yksi rivi muodossa "Ratsastajan nimi (VRL-tunnus) -
// Hevosen nimi VH-tunnus", esim. "Matti Meikäläinen (VRL-123456) - Ihka Ihana VH12-345-6789".
// Näin VRL-tunnus ja VH-tunnus saadaan pakollisiksi ja eroteltua sääntöjen valvontaa varten
// ilman erillisiä lomakekenttiä - sekä julkinen ilmoittautuminen (ks. [id]/ilmoittaudu.js)
// että adminin osallistujahallinta (ks. [id]/muokkaa-osallistuja.js, lisaa-osallistuja.js)
// jäsentävät saman kentän tällä samalla säännöllä.
const ILMOITTAUTUMINEN_REGEX = /^(.+?)\s*\(\s*(VRL-\d+)\s*\)\s*-\s*(.+?)\s*(VH\d{2}-\d{3}-\d{4})\s*$/i;

// Palauttaa { vrlTunnus, vhTunnus } jos nimi noudattaa vaadittua muotoa, muuten null.
function jasennaIlmoittautuminen(nimi) {
  const osat = ILMOITTAUTUMINEN_REGEX.exec(nimi);
  if (!osat) return null;
  const [, , vrlTunnus, , vhTunnusRaw] = osat;
  return { vrlTunnus, vhTunnus: vhTunnusRaw.toUpperCase() };
}

// Villin lajin pisteiden jako (ks. migrations/0021_laji_pisteet.sql). Lista tallennetaan
// pilkuilla eroteltuna tekstinä, esim. "10,9,8" - palauttaa kokonaislukutaulukon, tai null
// jos jokin arvo ei ole ei-negatiivinen kokonaisluku (käytetään lomakkeen validoinnissa).
function jasennaPisteet(teksti) {
  const osat = (teksti || '')
    .split(/[,;\s]+/)
    .map((o) => o.trim())
    .filter(Boolean);
  if (!osat.every((o) => /^\d+$/.test(o))) return null;
  return osat.map((o) => parseInt(o, 10));
}

function onkoPistejako(laji) {
  return Boolean(laji) && ((jasennaPisteet(laji.pisteet) || []).length > 0 || laji.pisteet_muille > 0);
}

// Pisteet sijalle: sijoituslistan mukaan, sen ulkopuolelle jääneille hyväksytyille
// pisteet_muille, hylätyille (sija null) 0. Palauttaa null jos lajilla ei ole pistejakoa.
function pisteetSijalle(laji, sija) {
  if (!onkoPistejako(laji)) return null;
  if (sija == null) return 0;
  const lista = jasennaPisteet(laji.pisteet) || [];
  return sija <= lista.length ? lista[sija - 1] : laji.pisteet_muille;
}

// Kilpailukutsun Säännöt-osion teksti, esim. "1. 10 p., 2. 9 p., muut hyväksytyt 1 p.,
// hylätyt 0 p." - tyhjä jos lajilla ei ole pistejakoa.
function pistejakoTeksti(laji) {
  if (!onkoPistejako(laji)) return '';
  const osat = (jasennaPisteet(laji.pisteet) || []).map((p, i) => `${i + 1}. ${p} p.`);
  osat.push(`${osat.length ? 'muut hyväksytyt' : 'kaikki hyväksytyt'} ${laji.pisteet_muille} p.`);
  osat.push('hylätyt 0 p.');
  return osat.join(', ');
}

// Ilmoittautuminen päättyy VIP-päivän lopussa (UTC), samalla hetkellä kun cron saa arpoa
// kilpailun (ks. lib/db.js:n listArvontaaOdottavat) - kilpailu voi silti olla vielä tilassa
// 'avoinna' cronin seuraavaan ajoon asti, joten tila yksin ei riitä.
function ilmoittautuminenPaattynyt(kilpailu, nyt = Date.now()) {
  return nyt >= Date.parse(`${kilpailu.vip_iso}T00:00:00Z`) + 24 * 60 * 60 * 1000;
}

export {
  ilmoittautuminenPaattynyt,
  jasennaPisteet,
  pisteetSijalle,
  pistejakoTeksti,
  ratsastajanMaxHevoset,
  hevostaRatsastajaaKohtiLuokassa,
  sijoittuneidenMaara,
  ILMOITTAUTUMINEN_REGEX,
  jasennaIlmoittautuminen,
};
