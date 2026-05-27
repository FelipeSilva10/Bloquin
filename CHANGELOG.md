# Changelog — Bloquin IDE

Todas as mudanças notáveis neste projeto serão documentadas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/)
e este projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

> Este arquivo é atualizado automaticamente pelo workflow de release via git-cliff.
> Não edite manualmente — use commits convencionais para gerar entradas corretas.

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

<!-- O histórico de versões será inserido abaixo automaticamente pelo git-cliff -->
