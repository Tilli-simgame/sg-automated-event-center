-- Villin lajin (ks. 0013_lajit.sql) hylättyjen osuus: arvonnan (ks. ../lib/kilpailun_arvonta.js)
-- jälkeen luokan alhaisimman tuloksen saaneista hylätään ceil(prosentti / 100 x osallistujamäärä)
-- (esim. 10 % -> 20 osallistujasta 2, 21 osallistujasta 3). Hylätyt tallennetaan tulokset-tauluun
-- sija = NULL, kuten VRL-tuloksissa. 0 = ei hylättyjä (oletus).
ALTER TABLE lajit ADD COLUMN hylattyja_prosenttia INTEGER NOT NULL DEFAULT 0;

-- Arvonnan lisäämät täytehevoset (ks. 0019_laji_taytehevoset.sql) merkitään, jotta
-- uudelleenarvonta (ks. ../functions/kilpailut/[id]/arvo-uudelleen.js) voi poistaa ne ja lisätä
-- uudet lajin nykyisten asetusten mukaan. 0 = oikea osallistuja, 1 = täytehevonen.
ALTER TABLE osallistujat ADD COLUMN taytehevonen INTEGER NOT NULL DEFAULT 0;
