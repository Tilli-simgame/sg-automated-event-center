-- Villin lajin (ks. 0013_lajit.sql) täytehevoset: jos luokkaan ei ole arvontaan mennessä tullut
-- vähintään min_osallistujia_per_luokka osallistujaa, arvonta (ks. ../lib/kilpailun_arvonta.js)
-- lisää luokkaan täytehevosia kunnes raja täyttyy (kuitenkin enintään luokan max_osallistujia).
-- Täytehevoset ovat tavallisia osallistujat-rivejä ilman tunnuksia, joten ne näkyvät tuloksissa
-- kuten muutkin. 0 = ei täytehevosia (oletus).
ALTER TABLE lajit ADD COLUMN min_osallistujia_per_luokka INTEGER NOT NULL DEFAULT 0;
-- Täytehevosen nimi tuloksissa, esim. "Ratsastaja - Täytehevonen". "{n}" korvataan täytehevosen
-- järjestysnumerolla luokan sisällä (esim. "Täytehevonen {n}" -> "Täytehevonen 1", ...).
ALTER TABLE lajit ADD COLUMN taytehevonen_nimi TEXT NOT NULL DEFAULT 'Ratsastaja - Täytehevonen';
