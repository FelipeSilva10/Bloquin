# Histórico SQL anterior ao baseline

Esta pasta preserva, sem reescrita, as 18 migrations encontradas no working
tree antes da reconciliação do Lote 1.

Os arquivos não são executados por `supabase db reset`. Eles existem para:

- manter a proveniência do DDL incremental;
- permitir auditoria de alterações aplicadas dentro e fora do histórico;
- documentar objetos que foram substituídos por migrations posteriores;
- evitar que o baseline consolidado apague evidência útil.

O diretório ativo `supabase/migrations` mantém as 15 versões registradas no
projeto remoto. A primeira versão carrega o snapshot consolidado de
`public/private`; as 14 seguintes são marcadores históricos. A migration do
Lote 1 é aplicada depois delas.

Não copie estes arquivos de volta para `supabase/migrations` nem execute o
conteúdo inteiro contra um projeto existente. O estado final de várias
funções e policies foi substituído por versões posteriores.

## Integridade dos originais

| Arquivo | SHA-256 |
| --- | --- |
| `20260727000000_project_management.sql` | `2d85366eff8ea53bf6c315eeada55466dfe64b800a8342b1bcf10b54a5548fcb` |
| `20260727144628_add_audit_query_indexes.sql` | `e43f0d760e60c8d560552e706dea021f859c5f777c67c6f967410d6a562e56c6` |
| `20260727151053_harden_project_rpc_privileges_and_search_paths.sql` | `000217992ce825c5d4e071bca6c7dee30b0c3e85852057cb65a9612d5f85a702` |
| `20260727151317_tighten_project_ownership_policies.sql` | `5306b99973ca66c001d4cf865bd35868d0fc35da2449f67f5751211afdd788bf` |
| `20260727151415_optimize_app_rls_auth_checks.sql` | `1b00e6bc7fe605e0ccc5c09449f6664cf5719874813d653d8a9b0c81a58ac7ee` |
| `20260728005251_create_library.sql` | `527ab885b26d66a5992c9a2e577870867be412badbdbde3c0833391c371278bd` |
| `20260728014634_library_archive_restore.sql` | `8740237010f3ea527e3955e69750871c10a8fd47677f0981f9779312ae192368` |
| `20260728014958_library_payload_hardening.sql` | `6c998171ad687093b45b5dc3162d54bba30aabfd9530846f172a65b293efcf47` |
| `20260728015220_library_metadata_limits.sql` | `8281e17c3b48cf6690fa2616b7fcdb9580193ba154246fd4a95eac4db104d26a` |
| `20260728020815_harden_legacy_security.sql` | `dbe266a787f6f95233cd27b92b9d93b522f5cc881df650a177ca7622f7a05ba2` |
| `20260728020931_finalize_legacy_security.sql` | `904402b1e4f81fe9784bdd5ae79c8591524aba5e55506e191f5046e930697a31` |
| `20260728021256_fix_rls_policy_recursion.sql` | `19341ff9b372a8007101ccf76db67202282b060a64f5f3cc29b99d7051d7b9e8` |
| `20260728021442_add_library_cover_index.sql` | `3b146e866e3c355375cc896df0aaec6870727e13b4829f260623367727d48564` |
| `20260728023217_fix_library_class_access.sql` | `e418fd5a80a7b114155af3981174d811b711706c7d32fc7e9f15fdcf44a2d648` |
| `20260728025447_harden_library_publish_identity.sql` | `2162c38a1e552f7244d64ce0e9ef27444d04464630450ad91cea724bcb372fd4` |
| `20260728030130_restore_archived_library_permissions.sql` | `392bdabbf3f30409e0b469069dc43599df017b7706b1735625b241b4c5bbf642` |
| `20260729120000_fix_library_publish_authorization.sql` | `0532f6c53f0b0514576e656ca11f8edf918b8de1fe8578d71151e1fc120990d3` |
| `20260729160000_repair_library_publication_insert_rls.sql` | `0aff4f025f52bbf8ec25cd353344a054c2ba887ae36924a2ec54d5ddf91dec6c` |
