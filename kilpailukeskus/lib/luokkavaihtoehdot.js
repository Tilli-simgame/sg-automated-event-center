'use strict';

/**
 * Jaoskohtaiset valmiit kilpailuluokkavaihtoehdot "Uusi kilpailu" -lomakkeen
 * luokkavalitsinta varten. Lähde: ../../disciplines_classes.md. Avaimet vastaavat
 * ./jaokset.js:n jaos-id:itä - Työhevosyhdistys (TYH) on jätetty pois samasta syystä kuin
 * Näyttelyjaos jaokset.js:ssä: se ei ole valittavissa "Ilmoita perinteiset kilpailut"
 * -lomakkeella.
 *
 * Huom: osa ERJ:n luokkanimistä (esim. "40cm", "50cm") on itsessään VRL:n
 * tulostenlähetyslomakkeen vaatimaa yli 5 merkkiä lyhyempiä (ks. ../../lib/tulokset_client.js:n
 * kommentti) - "Uusi kilpailu" -lomake (../functions/kilpailut/uusi.js) lisää siksi jokaisen
 * luokan nimen eteen juoksevan numeron (esim. "2. 40cm") ennen tallennusta, mikä ratkaisee
 * pituusvaatimuksen automaattisesti.
 */

const JAOS_LUOKAT = {
  // ERJ - Esteratsastusjaos
  '1': ['Puomiluokka', '40cm', '50cm', '60cm', '70cm', '80cm', '90cm', '100cm', '110cm', '120cm', '130cm', '140cm', '150cm', '160cm'],

  // KRJ - Kouluratsastusjaos
  '2': ['Helppo D', 'Helppo C', 'Helppo B', 'KN Special', 'Helppo A', 'Vaativa B', 'Vaativa A', 'Prix St. Georges', 'Intermediate I', 'Intermediate II', 'Grand Prix'],

  // KERJ - Kenttäratsastusjaos (nimi sisältää kelpoisuusrajauksen, ks. lähde tarkempine osakoetasoineen)
  '3': [
    'Miniluokka (avoin kaikille)',
    'Aloittelijaluokka (avoin muuleille, poneille ja hevosille)',
    'Harrasteluokka (avoin muuleille, poneille ja hevosille)',
    'Tutustumisluokka (avoin vain poneille ja hevosille)',
    'Helppo (avoin vain poneille ja hevosille)',
    'CIC1 (avoin vain poneille ja hevosille)',
    'CIC2 (avoin vain poneille sk. alle 149cm ja hevosille, ei suomenhevosille)',
    'CIC3 (avoin vain hevosille, ei suomenhevosille)',
    'CIC4 (avoin vain hevosille, ei suomenhevosille)',
    'CIC5 (avoin vain hevosille, ei suomenhevosille)',
  ],

  // VVJ - Valjakkoajojaos
  '4': [
    'Noviisi Koulukoe', 'Noviisi Tarkkuuskoe', 'Noviisi Kestävyyskoe', 'Noviisi Yhdistetty',
    'Helppo Koulukoe', 'Helppo Tarkkuuskoe', 'Helppo Kestävyyskoe', 'Helppo Yhdistetty',
    'Vaativa Koulukoe', 'Vaativa Tarkkuuskoe', 'Vaativa Kestävyyskoe', 'Vaativa Yhdistetty',
    'Vaikea Koulukoe', 'Vaikea Tarkkuuskoe', 'Vaikea Kestävyyskoe', 'Vaikea Yhdistetty',
  ],

  // WRJ - Westernjaos (lähteessä "Lännenratsastusjaos", sama jaos kuin jaokset.js:n WRJ)
  '5': [
    'Halter', 'Halter Showmanship', 'Trail-In-Hand', // maastakäsiteltävät lajit
    'Reining', 'Freestyle Reining', 'Versatile Horse', 'Western Riding', 'Western Horsemanship',
    'Western Trail', 'Ranch Trail', 'Western Pleasure', 'Barrel Racing', 'Pole Bending',
    'Keyhole Race', 'Cutting', 'Reined Cow Horse', 'Breakaway Roping',
  ],

  // ARJ - Askellajiratsastusjaos (rotu-/käyntilajilyhenteet suluissa, ks. lähde)
  '6': [
    'Helppo töltti (isl)', 'Töltti T.1 (isl)', 'Töltti T.2 (isl)', 'Helppo 4-käynti (isl)',
    '4-käynti V.1 (isl)', 'Helppo 5-käynti (isl)', '5-käynti F.1 (isl)', 'Passikoe PP.1 (isl)',
    '250 metrin passijuoksu P.1 (isl)', 'Speedpassi P.2 (isl)', 'Kouluratsastus FS1 (isl)',
    '5-käynti (sdb, nsh)', 'Slow gait (sdb, nsh)', 'Rack (sdb, nsh)',
    'Nelitahtikäynti (twh)', 'Juoksukäynti (twh)', 'Keinutuolilaukka (twh)',
    'Foxtrot (mft)', 'Amble (rmh)', 'Platform Walk (rmh, pasot)',
    '3-käynti (ryhmä 1, muut kuin isl, sdb, nsh, twh)',
    '4-käynti (ryhmä 1, muut kuin isl, sdb, nsh, twh)',
    '5-käynti (ryhmä 1, muut kuin isl, sdb, nsh, twh)',
    'Marcha Picada (mangalarga)', 'Marcha Batida (mangalarga)',
    'Fino Clasico (pasot)', 'Paso Corto (pasot)', 'Paso Largo (pasot)',
    'Cobtail (hackneyponi)', 'Road Pony (hackneyponi)', 'Harness Pony (hackneyponi)', 'Pleasure Pony (hackneyponi)',
    // Varsaluokat
    'Classic pleasure', 'Classic pleasure driving', 'Classic country combination',
    'Country pleasure', 'Country pleasure driving', 'Country combination',
    'English pleasure', 'English pleasure driving', 'Informal combination',
    'Show pleasure', 'Show pleasure driving', 'Informal show combination',
    'Park', 'Park harness', 'Formal combination', 'Showmanship', 'Equitation',
    'Pleasure driving (avoinna kaikille roduille)', 'Fine harness', 'Roadster',
  ],
};

export { JAOS_LUOKAT };
