-- Villin lajin (ks. 0013_lajit.sql) pisteiden jako: sijoituskohtaiset pisteet pilkuilla
-- eroteltuna (esim. "10,9,8,7,6,5,4,3,2" = 1. sija 10 p., 2. sija 9 p., ...) sekä pisteet
-- kaikille muille hyväksytyille tuloksille. Hylätyt (sija NULL, ks.
-- 0020_laji_hylatyt_ja_taytehevosmerkinta.sql) eivät saa pisteitä. Pisteitä ei tallenneta
-- tuloksiin, vaan ne lasketaan näytettäessä (ks. ../lib/saannot.js:n pisteetSijalle).
-- Tyhjä lista ja 0 = ei pisteitä (oletus).
ALTER TABLE lajit ADD COLUMN pisteet TEXT NOT NULL DEFAULT '';
ALTER TABLE lajit ADD COLUMN pisteet_muille INTEGER NOT NULL DEFAULT 0;
