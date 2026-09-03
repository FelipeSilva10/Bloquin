# Instalador Windows

## Estrutura e build

O Bloquin usa Tauri 2. O alvo Windows configurado em
`src-tauri/tauri.conf.json` é **NSIS**, portanto o artefato é um instalador
`.exe`, e não um MSI/WiX. O build de produção da release roda no job Windows
de `.github/workflows/release.yml`.

A tag de release é a origem da versão publicada. O workflow remove o prefixo
`v`, executa `scripts/sync-version.mjs` e sincroniza `package.json`,
`package-lock.json`, `src-tauri/tauri.conf.json`, `Cargo.toml` e `Cargo.lock`.
O nome do instalador é obtido de `package.json` depois dessa sincronização:

```
BloquinIDE_<versão>.exe
```

Por exemplo, a tag `v2.5.0` produz `BloquinIDE_2.5.0.exe`. Para um build local
Windows, use `npm run tauri:windows`; esse comando chama o Tauri/NSIS e depois
`scripts/rename-windows-installer.mjs`. O script falha se não encontrar
exatamente um instalador para renomear, evitando publicar um artefato errado.

## Ícone

O executável da aplicação usa os ícones declarados em `bundle.icon`. O NSIS
não recebia antes uma configuração própria para o executável do instalador.
Agora `bundle.windows.nsis.installerIcon` aponta explicitamente para
`src-tauri/icons/icon.ico`, gerado a partir da logo oficial
`src/assets/LogoSimples.png` pelo comando `npm run icons:generate`.

O ICO atual contém tamanhos 16, 24, 32, 48, 64 e 256 px. Não foi alterada a
arte da logo. A aparência final deve ser conferida no Windows Explorer e na
tela do NSIS, pois esta máquina não executa o backend Windows.

## CP210x: auditoria de licença e estado atual

Foi auditado o arquivo oficial
`https://www.silabs.com/documents/public/software/CP210x_Universal_Windows_Driver.zip`
em 31 de agosto de 2026. O pacote obtido é **CP210x Universal Windows Driver
11.5.0** (`DriverVer 11.5.0.417`, 10 de dezembro de 2025), SHA-256
`7cba499e944f0cd6c6de4a3c80a4646e9b0307d6704bcfa155a11f05774345e8`.

O acordo `SLAB_License_Agreement_VCP_Windows.txt` desse pacote não autoriza a
redistribuição do pacote assinado intacto: a cláusula 3(e) diz que a
redistribuição aos clientes é permitida somente com INF e XML modificados. O
pacote Universal atual não traz XML; modificar o `silabser.inf` também invalida
o catálogo WHQL `silabser.cat`, de que o Windows precisa para instalar o driver
assinado. Por isso, o driver **não é incorporado ao repositório nem ao instalador**
e nenhum download é feito pelo aplicativo ou pelo instalador.

Isso impede, por enquanto, a instalação offline automática do driver sem uma
autorização escrita da Silicon Labs ou um pacote redistribuível que preserve a
assinatura. Não é correto contornar essa limitação copiando o ZIP ou alterando
o INF. O Bloquin também não executa instalação de driver ao iniciar.

### Alternativa tecnicamente correta disponível hoje: instalação manual guiada

Como o instalador não pode embutir o driver, a alternativa correta — sem
baixar nada durante a instalação e sem violar a licença — é orientar quem usa
o Bloquin a obter o driver diretamente da fonte oficial, em vez de depender
apenas do usuário achar sozinho o Windows Update:

1. **Caminho mais comum — Windows Update automático:** em um Windows 10/11
   com acesso à internet, ao conectar a placa pela primeira vez o Windows
   normalmente já baixa e instala o CP210x sozinho em alguns segundos, sem
   ação manual. Basta aguardar antes de tentar selecionar a porta no Bloquin.
2. **Quando isso não acontece** (Windows Update desativado por política,
   máquina sem internet no momento da conexão, ou instalação corporativa/
   escolar restrita): baixe o instalador oficial em
   `https://www.silabs.com/developer-tools/usb-to-uart-bridge-vcp-drivers` (a
   mesma família de driver auditada acima) e execute-o com privilégios
   administrativos, ou instale manualmente pelo Gerenciador de Dispositivos
   → dispositivo desconhecido → **Atualizar driver** → **Pesquisar
   automaticamente**.

Essa orientação deve ficar visível para quem instala o Bloquin (por exemplo
no README e na documentação de primeiros passos) até que a Silicon Labs
autorize a redistribuição ou publique um pacote redistribuível — momento em
que os passos da seção seguinte passam a valer.

### Como ativar a instalação automática após autorização

Após receber autorização que permita redistribuir o pacote assinado, ou um
pacote oficialmente destinado a OEM/redistribuição, a implementação deve ser
feita somente no NSIS e somente no build Windows:

1. Adicionar os arquivos autorizados em `src-tauri/resources/cp210x/`, sem
   alterar `silabser.inf`, `silabser.cat` nem os arquivos `.sys`.
2. Criar um `installerHooks` NSIS com `installMode: "perMachine"`. Esse modo
   usa a elevação UAC normal; não deve haver tentativa de burlar o UAC.
3. No hook `NSIS_HOOK_POSTINSTALL`, depois dos arquivos serem copiados, chamar:

   ```text
   %SystemRoot%\\System32\\pnputil.exe /add-driver "$INSTDIR\\resources\\cp210x\\*.inf" /subdirs /install
   ```

4. Registrar a saída e o código de retorno no log do instalador. `pnputil`
   coloca o pacote no Driver Store e seleciona o melhor driver compatível; uma
   execução repetida não precisa remover nem reinstalar manualmente um driver
   já compatível. Um código diferente de zero precisa interromper/registrar a
   falha de forma visível.

Esses passos não foram habilitados antes da autorização porque apontariam para
arquivos que não podem ser distribuídos sob os termos verificados.

## Validação em Windows limpo após a autorização

1. Execute `npm run test:installer` e `npm run tauri:windows` em Windows.
2. Confirme que `src-tauri/target/release/bundle/nsis/` contém somente o
   instalador esperado, por exemplo `BloquinIDE_2.5.0.exe`.
3. Abra as propriedades do `.exe` e a primeira tela do NSIS para conferir o
   ícone Bloquin; valide a assinatura após o passo de assinatura da release.
4. Liste o instalador com 7-Zip e confira `resources/cp210x/silabser.inf`,
   `.cat` e os `.sys` da versão autorizada.
5. Em uma VM Windows 10 1803+ ou Windows 11 limpa, conecte uma placa CP210x,
   execute o instalador elevado pelo UAC e confira o log do `pnputil` e o
   Gerenciador de Dispositivos.
6. Execute uma atualização/reinstalação e confirme que não há erro nem troca
   desnecessária de driver. Teste também uma falha real (pacote corrompido) e
   confirme que ela aparece no log.

No ambiente Linux atual foi possível validar a configuração, o nome, os testes
estáticos e o build AppImage, mas não compilar nem executar o NSIS/UAC ou
inspecionar o conteúdo de um `.exe` Windows.

## Atualização automática (Tauri Updater)

A partir da primeira versão publicada com essa mudança, o canal Windows/NSIS
(download direto, fora da Microsoft Store) tem auto-update nativo via
`tauri-plugin-updater` + `tauri-plugin-process`. Isso substitui, só nesse
canal, o fluxo antigo de "avisa que existe versão nova → abre o site → baixa
manualmente". **Antes de publicar essa primeira versão como release estável,
valide numa máquina Windows real com uma tag de pré-lançamento** (ex.:
`vX.Y.Z-beta.1` — o `release.yml` já suporta esse canal) — ver limitações no
fim desta seção.

### Por que só o canal NSIS, nunca o MSIX/Store

O Bloquin é distribuído por dois canais totalmente separados (ver seções
acima e `.github/workflows/msix.yml`): o NSIS deste documento, e um MSIX
hand-rolled pra Microsoft Store. **O updater nunca deve rodar sob o MSIX** —
a Store tem seu próprio mecanismo de atualização, e um app se atualizando
por fora dela viola a política da própria Microsoft (já tivemos uma rejeição
de certificação por outro motivo; não vale a pena arriscar outra).

Em vez de compilar dois binários diferentes (o que arriscaria o pipeline do
MSIX, que já é frágil), a distinção é feita em runtime: pacotes MSIX sempre
rodam a partir de `C:\Program Files\WindowsApps\<PackageFamilyName>\` — é o
Windows quem instala lá, e nenhum outro canal usa esse caminho. O comando
Rust `is_store_package` (`src-tauri/src/lib.rs`) checa isso, e
`src/services/appUpdaterService.ts::isStorePackage()` faz o front-end nunca
chamar `check()` quando esse comando retorna `true`. O plugin do updater é
registrado incondicionalmente nos dois binários — a garantia de que ele não
age vem inteiramente dessa checagem, não de uma feature flag de build.

### Como funciona, ponta a ponta

1. No boot do app (`src/App.tsx`, `AppContent`), uma vez por sessão
   (`sessionStorage['bloquin.update-check']`, mesmo padrão de antes):
   - Se `isStorePackage()` → não faz nada.
   - Senão, chama `checkForNativeUpdate()`, que baixa e verifica a
     assinatura de `https://github.com/FelipeSilva10/Bloquin/releases/latest/download/latest.json`
     contra a chave pública embutida em `tauri.conf.json`
     (`plugins.updater.pubkey`). Isso já compara semver: só retorna algo se
     a versão remota for maior — sem downgrade acidental.
   - Se não estiver rodando dentro do Tauri (preview de navegador/dev), cai
     no fluxo antigo (`checkForUpdate()`/`openOfficialSite()`,
     inalterado) — só pra manter o preview útil, sem qualquer efeito no app
     real.
2. Se há atualização: aparece o banner (`NativeUpdateNotice`, mesmo visual
   do aviso antigo) — "Nova atualização disponível" com
   **Atualizar agora**/**Depois**.
3. **Atualizar agora** chama `update.download(onProgress)` — só baixa,
   não instala nem fecha o app. A barra de progresso usa os eventos
   `Started`/`Progress`/`Finished` do próprio plugin; quando o tamanho total
   não vem informado, mostra uma barra indeterminada em vez de travar em 0%.
4. Download concluído → "Atualização pronta" com
   **Reiniciar agora**/**Mais tarde**. Fechar ("Mais tarde") não descarta o
   download nem cancela nada — só esconde o aviso; o objeto `Update`
   continua vivo em memória enquanto a aba não for recarregada.
5. **Reiniciar agora** chama `update.install()`. No Windows isso **fecha o
   Bloquin ao lançar o instalador com sucesso** (o resto do fluxo, incluindo
   reabrir o app, é responsabilidade do próprio instalador NSIS rodando em
   modo `passive`) — por isso não há um `relaunch()` manual nesse caminho.
   `tauri-plugin-process` está registrado mesmo assim, pensando numa
   eventual expansão pra Linux/macOS, onde `install()` exige relançar o app
   manualmente.
6. Qualquer falha (sem internet, GitHub fora do ar, `latest.json` ausente,
   download interrompido, assinatura inválida) faz `check()`/`download()`
   rejeitar; o app trata isso retornando `null`/mostrando um aviso de erro
   dispensável — nunca quebra a inicialização nem deixa a instalação atual
   pela metade. Uma assinatura que não bate é recusada pelo próprio plugin
   antes de tocar em qualquer arquivo instalado.

### Privilégios administrativos

`bundle.windows.nsis.installMode` nunca foi definido em `tauri.conf.json`,
então vale o padrão do Tauri 2: **`currentUser`** — instala em
`%LOCALAPPDATA%`, sem UAC, registro em HKCU. Isso já era assim antes do
updater. A própria documentação/issues do Tauri confirmam que os modos
silenciosos do updater (`quiet`/`passive`, configurado aqui como
`plugins.updater.windows.installMode: "passive"`) só funcionam sem elevação
quando a instalação já é per-user — exatamente o caso do Bloquin. Ou seja:
**a atualização inteira roda sem senha de administrador**, preservando a
característica que interessa pra laboratórios escolares com contas sem
admin.

### Assinatura: o que é público, o que é secreto

- **Chave pública** (`plugins.updater.pubkey` em `tauri.conf.json`): fica
  commitada no repositório sem problema — ela só serve pra *verificar*
  assinaturas, nunca pra criar.
- **Chave privada**: existe *apenas* como os secrets do GitHub Actions
  `TAURI_SIGNING_PRIVATE_KEY` (conteúdo do arquivo `.key`) e
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Nunca deve entrar no repositório.
  Felipe também tem uma cópia local de custódia (fora do repo) — se os dois
  sumirem juntos, nenhum Bloquin já instalado aceita mais uma atualização
  assinada com uma chave nova, sem uma versão-ponte pra trocar de chave.
- A assinatura Ed25519 do updater é **separada** da assinatura Authenticode
  (`WINDOWS_CERTIFICATE`) que já existia. São duas cadeias de confiança
  diferentes: uma pro Windows/SmartScreen confiar no executável, outra pro
  próprio Bloquin confiar que um `.exe` baixado veio de fato do build oficial.
- **Ordem importa**: a assinatura do updater é gerada *depois* da assinatura
  Authenticode (job `build-windows` de `release.yml`, passo "Gerar
  assinatura do updater (Tauri)"), porque o Authenticode reescreve os bytes
  do `.exe` ao embutir o certificado — assinar antes geraria uma assinatura
  que não bate mais com o arquivo publicado.
- Rotação de chave: gerar um novo par (`npx tauri signer generate`),
  atualizar os dois secrets do GitHub e o `pubkey` em `tauri.conf.json`, e
  publicar uma versão nova. Instalações antigas (com o `pubkey` velho) não
  reconhecem `latest.json` assinado com a chave nova — a rotação só é segura
  se você aceita que quem está numa versão muito antiga vai precisar baixar
  o instalador manualmente uma última vez.

### O que o SmartScreen ainda faz (e o updater não muda isso)

O auto-update não elimina o aviso do SmartScreen na *primeira* instalação —
isso é reputação de publisher, não assinatura (ver a seção sobre certificado
EV mencionada na conversa que originou essa funcionalidade: nem certificado
EV garante confiança instantânea hoje em dia). O que o updater evita é ter
que passar por esse fluxo manual de novo a cada nova versão sobre uma
instalação que já existe — o `.exe` novo é baixado e lançado pelo próprio
app, não por um duplo-clique manual no Explorer.

### Como publicar uma nova versão (fluxo inalterado + 1 passo automático)

O processo de release continua o mesmo de sempre — `node
scripts/sync-version.mjs X.Y.Z`, commit, `git tag vX.Y.Z`, `git push --tags`.
O workflow `release.yml` agora inclui, sem passo manual adicional:

1. Build + assinatura Authenticode do `.exe` (como já era).
2. **Novo:** assina o `.exe` já finalizado com a chave do updater, gerando
   `BloquinIDE_X.Y.Z.exe.sig`.
3. **Novo:** `scripts/generate-updater-manifest.mjs` monta `latest.json`
   (versão, notas do git-cliff, assinatura, URL de download) e publica junto
   dos demais assets da release.
4. Usuários com o Bloquin já instalado detectam a atualização no próximo
   boot, sem qualquer ação manual do professor/aluno além de clicar em
   "Atualizar agora" e depois "Reiniciar agora".

Não é preciso gerar `latest.json` manualmente nem rodar `tauri signer sign`
à mão — os dois passos novos do workflow cuidam disso a partir dos secrets
já configurados.

### Limitações atuais / próximos passos

- **Só Windows/NSIS.** Linux (AppImage) não recebeu updater nesta entrega —
  o plugin suporta, mas exigiria pesquisar o formato de update do AppImage
  (`.tar.gz` + `.sig`) e um novo bloco `platforms.linux-x86_64` no
  manifesto; ficou fora de escopo deliberadamente.
- **MSIX/Store nunca atualiza por conta própria** — por design (ver acima).
- Não foi possível testar em uma VM/máquina Windows real neste ambiente
  (Linux, sem Windows disponível) — a verificação foi: `cargo check` limpo
  com os plugins novos, build de produção do frontend limpo, os 4 estados de
  UI (disponível/baixando/pronto/erro) conferidos visualmente com o serviço
  do updater simulado, e o roundtrip completo de geração de chave → assinar
  um arquivo → gerar `latest.json` testado localmente com a CLI real do
  Tauri. **O primeiro teste em produção precisa ser: publicar uma versão de
  teste (ex. um pré-release `-beta.1`) e confirmar, numa máquina Windows
  real com uma versão anterior instalada, que o fluxo completo funciona,
  incluindo o `install()` fechando e reabrindo o Bloquin sozinho.**
- O aviso "Mais tarde" depois do download não persiste entre reinícios do
  app — fechar e reabrir o Bloquin descarta o download em memória e refaz a
  checagem (uma vez por sessão, como sempre foi). Aceitável pra uma primeira
  versão; poderia evoluir pra download em segundo plano persistente se
  virar um incômodo real.
