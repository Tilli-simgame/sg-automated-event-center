-- Villin lajin (ks. 0013_lajit.sql) osallistujat ilman VRL-/VH-tunnuksia: omien hevosten
-- automaattilisäys (ks. ../lib/omat_hevoset.js) kirjoittaa rivin muodossa "Ratsastaja - Hevonen",
-- ja julkinen ilmoittautuminen (ks. functions/kilpailut/[id]/ilmoittaudu.js) hyväksyy rivit
-- vapaamuotoisina ilman tunnusperusteisia tarkistuksia. 0 = ei (oletus), 1 = kyllä.
ALTER TABLE lajit ADD COLUMN ilman_tunnuksia INTEGER NOT NULL DEFAULT 0;
