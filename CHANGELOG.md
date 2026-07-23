# Changelog — Bloquin IDE

Todas as mudanças notáveis neste projeto serão documentadas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/)
e este projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

> As notas de release são geradas pelo workflow via git-cliff a partir dos commits
> convencionais. A seção da versão em preparação deve permanecer alinhada com esse histórico.

---

## Guia de commits convencionais

```
feat: adiciona bloco de motor DC L298N
fix: corrige geração de código para buzzer passivo
docs: atualiza guia do professor
refactor: separa lógica de geração de código em módulos
perf: otimiza compilação do backend Rust
style: ajusta cores da toolbox de blocos
test: adiciona testes para o gerador de código ESP32
chore: atualiza dependências do Tauri
```

Para mudanças que quebram compatibilidade:
```
feat!: remove suporte ao Arduino Uno R1

BREAKING CHANGE: apenas Arduino Uno R3+ é suportado a partir desta versão.
```

---

<!-- Histórico de versões -->

## [1.1.0] — 23/07/2026

### Correções

- Corrigido o fluxo inicial para abrir a tela de login.
- Logout manual e automático agora encerram a sessão local, remota e do Supabase.
- Falhas de login, salvamento, upload e conexão serial recebem tratamento e feedback claros.
- Abas com alterações não salvas agora exibem uma confirmação própria antes de fechar.

### Interface e acessibilidade

- Toolbar da IDE refinada com comportamento adaptativo, menu “Mais” e tooltips acessíveis.
- Modais com foco de teclado, Escape, contenção de Tab e semântica ARIA.
- Dashboards com estados de erro, carregamento e ações mais consistentes.
- Monitor serial e painel de código ajustados para telas estreitas.
- Adicionados estados de foco, redução de movimento e feedback não bloqueante ao salvar.

### Performance e manutenção

- Editor Blockly carregado sob demanda para reduzir o carregamento inicial.
- Metadados das placas separados da definição dos blocos.
- Logo principal otimizado para uso na interface.
- Permissões Tauri de shell não utilizadas removidas.
- Configuração de CSP, documentação e formatação Rust revisadas.
