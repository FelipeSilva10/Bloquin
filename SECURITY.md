# Política de Segurança

## Versões suportadas

| Versão | Suporte |
|---|---|
| Última release estável (`latest`) | ✅ Recebe correções de segurança |
| Versões beta / RC | ⚠️ Melhor esforço |
| Versões anteriores | ❌ Sem suporte |

Sempre mantenha o Bloquin atualizado para a versão mais recente.

## Reportando uma vulnerabilidade

**Não abra uma issue pública para relatar vulnerabilidades de segurança.**

Se você descobriu uma falha de segurança, siga o processo de divulgação responsável:

1. **Envie um e-mail** para o endereço de contato listado no perfil do repositório, com o assunto `[SECURITY] Bloquin - <breve descrição>`.

2. Inclua na mensagem:
   - Descrição detalhada da vulnerabilidade
   - Passos para reproduzir
   - Impacto potencial e superfície de ataque
   - Versão(ões) afetada(s)
   - Se possível, sugestão de correção ou mitigação

3. Você receberá uma resposta de confirmação em até **72 horas**.

4. Trabalharemos para lançar uma correção em até **30 dias** após a confirmação da vulnerabilidade. Vulnerabilidades críticas serão priorizadas.

5. Após a correção publicada, você será creditado no release notes (a menos que prefira anonimato).

## Contexto do projeto

O Bloquin é uma aplicação desktop que:

- **Executa localmente** — não há servidor próprio exposto à internet
- **Acessa a internet** apenas para autenticação e sincronização via Supabase
- **Compila código** via arduino-cli empacotado localmente
- **Acessa hardware** via porta serial (USB)

Áreas de maior relevância para segurança:

- Comunicação com Supabase (credenciais, tokens)
- Execução de subprocessos (arduino-cli)
- Leitura/escrita de arquivos de projeto
- Conteúdo carregado via WebView do Tauri

## Escopo fora do projeto

Vulnerabilidades em dependências externas (Tauri, arduino-cli, Supabase, Blockly) devem ser reportadas diretamente aos respectivos projetos. Se a vulnerabilidade afetar o Bloquin especificamente através dessas dependências, nos informe também.
