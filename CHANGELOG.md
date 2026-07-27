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

## [1.2.0] — 27/07/2026

### Novas funcionalidades

- Adicionado indicador discreto da versão instalada nas telas de login e inicialização.
- Adicionada verificação silenciosa e não bloqueante de novas versões, com opção de atualizar pelo site oficial ou continuar depois.
- Versões do frontend, Tauri e Rust passam a ser sincronizadas automaticamente pelo script de release.

### Segurança e persistência

- Endurecidas as policies de ownership de projetos para impedir troca de dono ou turma fora do escopo autorizado.
- Corrigidas permissões e search paths das RPCs de projetos; chamadas anônimas de exclusão e compartilhamento foram bloqueadas.
- Otimizadas as policies do aplicativo para inicializar auth.uid() uma vez por consulta.
- Adicionadas migrations e índices para governança, auditoria e consistência do Supabase.

### Confiabilidade

- Melhorado o ciclo de sessão, heartbeat, logout offline e limpeza de listeners.
- Upload, serial, sketch temporário e preparação do arduino-cli passaram a validar estados e falhas com mais segurança.
- Inicialização da aplicação e preparação do backend ficaram menos bloqueantes.
- Geração Blockly passou a reduzir atualizações redundantes e a auditoria automatizada continua cobrindo blocos, placas e geradores.

### Manutenção

- Removidos do versionamento o ambiente local, o binário local do arduino-cli e um backup de imagem sem uso.
- Corrigidos o caminho do logo no README, a referência manual de versão e o launcher local.
- Atualizadas configurações de CI, release, capacidades Tauri e dependências Rust.

## [1.1.1] — 24/07/2026

### Correções

- Corrigida a geração de código para ESP-NOW, servo motor, PWM, I²C, ultrassônico e L298N em Arduino e ESP32.
- Corrigidos escapes de texto, literais decimais, identificadores de variáveis/funções e dependências auxiliares no C++ gerado.
- Corrigidos casos de sessão expirada, logout offline e modo visitante herdando autenticação ou limites de conta.
- Corrigidos pinos inválidos, conflitos de pinos, blocos fora de PREPARAR/AGIR e blocos ESP-NOW usados em placas incompatíveis.

### Interface e manutenção

- Toolbar da IDE ajustada para telas estreitas, com ícones, menu de ações e tooltips responsivos.
- Adicionada auditoria automatizada dos blocos e fixtures de compilação para validar boards, toolbox e código gerado.
- O setup passa a tentar instalar as bibliotecas Servo e ESP32Servo, sem bloquear o uso quando a instalação opcional falhar.

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
