-- Villin lajin (ks. 0013_lajit.sql) nimi omien hevosten rajapinnassa (discipline-parametri,
-- ks. ../lib/omat_hevoset.js) - lajin oma nimi ei välttämättä vastaa rajapinnan nimeä
-- (esim. "Koiraurheilujaos"). Tyhjä = käytetään lajin nimeä pienillä kirjaimilla.
ALTER TABLE lajit ADD COLUMN omat_hevoset_laji TEXT NOT NULL DEFAULT '';
