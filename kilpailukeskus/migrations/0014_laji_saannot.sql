-- Järjestäjän itse asettamat säännöt "villille" lajille (ks. 0013_lajit.sql). VRL:n
-- jaoskohtaiset rajat (ks. ../lib/jaosrajoitukset.js) eivät koske villejä lajeja, joten
-- järjestäjä päättää nämä itse per laji - ne pätevät sellaisenaan jokaiseen kyseisen lajin
-- kilpailuun (ks. ../lib/kilpailu_lomake.js:n kokoaJaosRajoitukset). Oletusarvot vastaavat
-- entistä yhteistä VILLI_JAOS_RAJOITUKSET_OLETUS-vakiota, jota nämä sarakkeet korvaavat.
ALTER TABLE lajit ADD COLUMN max_osallistujia_per_luokka INTEGER NOT NULL DEFAULT 100;
ALTER TABLE lajit ADD COLUMN max_lahtoja_per_hevonen INTEGER NOT NULL DEFAULT 10;
-- VRL:n jaoksilla "enintään 10 % luokan osallistujamäärästä" (ks. ../lib/saannot.js:n
-- ratsastajanMaxHevoset) - villeillä lajeilla järjestäjä asettaa kiinteän luvun sen sijaan,
-- koska villin kilpailun osallistumismuoto voi poiketa niin paljon ettei prosenttisääntö
-- ole enää mielekäs (ks. functions/lajit/[id]/muokkaa-saannot.js).
ALTER TABLE lajit ADD COLUMN max_hevosta_ratsastaja_per_luokka INTEGER NOT NULL DEFAULT 10;
-- Vapaamuotoiset, lajikohtaiset lisätiedot - toisin kuin yllä olevat kiinteät numeeriset
-- rajat nämä saavat vaihdella lajeittain vapaasti (ks. functions/[jaos]/[vuosi]/[kuukausi]/
-- [numero].js:n Säännöt-osio, jossa nämä näytetään kilpailukutsulla).
ALTER TABLE lajit ADD COLUMN osallistumismuoto TEXT NOT NULL DEFAULT '';
ALTER TABLE lajit ADD COLUMN saannot TEXT NOT NULL DEFAULT '';
