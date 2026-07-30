-- Pré-condição de restauração do baseline.
--
-- O dump remoto contém os GRANTs finais, mas pg_dump não emite REVOKEs para
-- privilégios herdados dos defaults do banco de destino. Sem esta
-- normalização, tabelas criadas durante `db reset` recebem privilégios extras
-- antes de os GRANTs do dump serem aplicados.
--
-- service_role e postgres permanecem inalterados. A migration do Lote 1
-- reaplica estes defaults ao final para proteger objetos futuros.

alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
