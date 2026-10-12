'use strict';

/**
 * Kovakoodattu jaos id -> nimi -kartoitus "Ilmoita perinteiset kilpailut" -lomakkeen
 * jaos-pudotusvalikkoa varten. Lähde: database/5 from_scratch_insert.sql
 * (taulu vrlv3_kisat_jaokset) - jaokset eivät käytännössä muutu, joten listaa ei haeta
 * dynaamisesti kohdesivulta.
 *
 * Näyttelyjaos (NJ, id 7) on jätetty pois tahallaan: sillä on nayttelyt=1 kannassa, ja
 * fuel/application/models/Jaos_model.php get_jaos_option_list() kutsutaan perinteiset-
 * lomakkeella skip_shows=true, eli WHERE nayttelyt=0 - NJ ei siis koskaan näy oikean
 * lomakkeen valikossa eikä kelpaisi tälle reitille (ks. Kilpailutoiminta.php
 * ilmoita_kilpailut('perinteiset')).
 *
 * Jos VRL:ään joskus perustetaan uusi jaos tai jokin poistuu käytöstä, päivitä tämä
 * lista käsin.
 */

const JAOKSET = [
  { id: '1', lyhenne: 'ERJ', nimi: 'Esteratsastusjaos' },
  { id: '2', lyhenne: 'KRJ', nimi: 'Kouluratsastusjaos' },
  { id: '3', lyhenne: 'KERJ', nimi: 'Kenttäratsastusjaos' },
  { id: '4', lyhenne: 'VVJ', nimi: 'Valjakkoajojaos' },
  { id: '5', lyhenne: 'WRJ', nimi: 'Westernjaos' },
  { id: '6', lyhenne: 'ARJ', nimi: 'Askellajiratsastusjaos' },
];

// Erottaa VRL:n viralliset jaokset järjestäjän itse luomista "villeistä" lajeista (ks.
// migrations/0013_lajit.sql) - villejä lajeja ei koskaan lähetetä VRL:n kisakalenteriin
// eikä niille tehdä VRL-kisa-id:n automaattihakua/tulostenlähetystä (ks.
// functions/kilpailut/[id]/laheta-vrl.js, lib/vrl_kisa_id_haku.js,
// lib/kilpailun_tulosten_lahetys.js). Kaikki muut id:t kuin nämä kuusi kiinteää ovat siis
// aina villejä - villin lajin id ei koskaan voi osua näihin (ks. lib/db.js:n seuraavaLajiId,
// joka alkaa 9900:sta).
function onkoVirallinenJaos(jaosId) {
  return JAOKSET.some((j) => j.id === jaosId);
}

export { JAOKSET, onkoVirallinenJaos };
