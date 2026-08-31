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
