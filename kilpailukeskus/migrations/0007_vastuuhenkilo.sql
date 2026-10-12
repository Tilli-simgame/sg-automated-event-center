-- Kilpailukutsulla näytettävän vastuuhenkilön nimi ja sähköposti - aiemmin kutsulla
-- näytettiin vain VRL_IDENTITY-ympäristömuuttuja (kirjautumistunnus, ei henkilön nimi),
-- ks. functions/[jaos]/[vuosi]/[kuukausi]/[numero].js.
ALTER TABLE kilpailut ADD COLUMN vastuuhenkilo_nimi TEXT NOT NULL DEFAULT '';
ALTER TABLE kilpailut ADD COLUMN vastuuhenkilo_email TEXT NOT NULL DEFAULT '';
