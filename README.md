<div align="center">

<img src="src/assets/LogoCompleta.png" alt="Bloquin IDE" width="300"/>

# Bloquin IDE

**Ambiente visual de programação para Arduino e ESP32 voltado para o ensino.**

[![CI](https://github.com/FelipeSilva10/Bloquin/actions/workflows/ci.yml/badge.svg)](https://github.com/FelipeSilva10/Bloquin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/FelipeSilva10/Bloquin?label=última%20versão&color=blue)](https://github.com/FelipeSilva10/Bloquin/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/FelipeSilva10/Bloquin/total?color=green)](https://github.com/FelipeSilva10/Bloquin/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey)](https://github.com/FelipeSilva10/Bloquin/releases/latest)

[Baixar agora](#-download) · [Documentação](docs/) · [Reportar bug](https://github.com/FelipeSilva10/Bloquin/issues/new?template=bug_report.yml) · [Sugerir funcionalidade](https://github.com/FelipeSilva10/Bloquin/issues/new?template=feature_request.yml)

</div>

---

## O que é o Bloquin?

O Bloquin é uma IDE baseada em blocos visuais para programação de microcontroladores **Arduino** e **ESP32**, projetada especificamente para ambientes educacionais. Alunos constroem programas arrastando blocos, veem o código C++ gerado em tempo real e fazem upload direto para a placa.

Desenvolvido e mantido por Felipe da Conceição Silva (https://www.linkedin.com/in/felipe-conceição-silva).

---

## Funcionalidades

| Funcionalidade | Descrição |
|---|---|
| Editor de blocos | Baseado no Google Blockly, com blocos em português |
| Compilação integrada | arduino-cli empacotado, sem instalação extra |
| Upload via USB | Envio direto para Arduino Uno, Nano e ESP32 DevKit V1 |
| Monitor serial | Comunicação serial em tempo real |
| Dashboard do professor | Visualiza e intervém nos projetos dos alunos |
| Projetos na nuvem | Salvamento automático via Supabase |
| Controle de sessão | Um dispositivo por conta, em tempo real |

---

## Download

| Plataforma | Link |
|---|---|
| **Windows 10/11** (64-bit) | [Bloquin-Setup-Windows.exe](https://github.com/FelipeSilva10/Bloquin/releases/latest/download/Bloquin-Setup-Windows.exe) |

> **Windows SmartScreen:** o instalador é assinado digitalmente. Se aparecer aviso, clique em **"Mais informações" → "Executar assim mesmo"**.
>
> **Linux:** após baixar, torne o arquivo executável: `chmod +x Bloquin-Linux.AppImage && ./Bloquin-Linux.AppImage`

### Links permanentes (sempre apontam para a última versão estável)

```
Windows: https://github.com/FelipeSilva10/Bloquin/releases/latest/download/Bloquin-Setup-Windows.exe
Linux:   https://github.com/FelipeSilva10/Bloquin/releases/latest/download/Bloquin-Linux.AppImage
```

---

## Configuração para desenvolvimento

### Pré-requisitos

- [Node.js](https://nodejs.org/) ≥ 20
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Tauri CLI v2 prerequisites](https://v2.tauri.app/start/prerequisites/) para seu sistema operacional

### Configuração do ambiente

```bash
# 1. Clone o repositório
git clone https://github.com/FelipeSilva10/Bloquin.git
cd bloquin

# 2. Instale as dependências
npm install

# 3. Copie o arduino-cli para src-tauri/resources/
#    Linux:   https://github.com/arduino/arduino-cli/releases (Linux_64bit.tar.gz)
#    Windows: https://github.com/arduino/arduino-cli/releases (Windows_64bit.zip)
#    Renomeie o binário para arduino-cli (ou arduino-cli.exe no Windows)

# 4. Configure as variáveis de ambiente (Supabase)
cp .env.example .env
# Edite .env com suas credenciais do Supabase

# 5. Inicie o servidor de desenvolvimento
npm run tauri dev
```

### Build de produção

```bash
npm run tauri build
# Outputs: src-tauri/target/release/bundle/
```

---

## Arquitetura

```
bloquin/
├── src/                    # Frontend React + TypeScript
│   ├── blockly/            # Definição de blocos, geradores e toolbox
│   ├── components/modals/  # Modais (compilação, serial, tutorial, etc.)
│   ├── screens/            # Telas principais (IDE, Login, Dashboards)
│   ├── services/           # Hardware, projetos e sessão
│   └── lib/supabase.ts     # Cliente Supabase
├── src-tauri/              # Backend Rust (Tauri)
│   ├── src/lib.rs          # Comandos Tauri (compilação, serial, etc.)
│   └── resources/          # arduino-cli empacotado
└── .github/workflows/      # CI/CD (lint, Rust check, release)
```

**Stack:** React 19 · TypeScript 5 · Vite 7 · Tauri 2 · Blockly 12 · Supabase · arduino-cli

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Leia o [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir um PR.

Para dúvidas rápidas, use a aba [Discussions](https://github.com/FelipeSilva10/Bloquin/discussions).

---

## 🔒 Segurança

Para reportar uma vulnerabilidade, **não abra uma issue pública**. Leia a [política de segurança](SECURITY.md).

---

## 📄 Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE) para mais detalhes.

---

<div align="center">
Feito com ❤️ para educação · <a href="https://www.linkedin.com/in/felipe-conceição-silva">Felipe da Conceição Silva</a>
</div>
