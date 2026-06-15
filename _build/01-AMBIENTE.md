# Praxis — Guia de Ambiente e Testes
> Este documento ensina a preparar o ambiente local de testes do zero.
> A primeira parte é para o **desenvolvedor** (você) — instalação única.
> A segunda parte é para o **Claude Code** — como subir e usar o emulador a cada sessão.
> A terceira parte explica a **divisão de testes**: o que o Claude Code testa e o que só você pode testar.

---

# PARTE 1 — INSTALAÇÃO (desenvolvedor, uma vez só)

## O que é o Firebase Emulator Suite e por que ele importa

O Firebase Emulator Suite é um conjunto de "cópias locais" dos serviços do Firebase — Firestore (banco), Authentication (login) e Functions (Cloud Functions) — que rodam **no seu próprio computador**, sem internet e sem tocar nos dados reais.

Ele importa por três motivos enormes:

1. **Testar de verdade sem risco.** O Claude Code pode criar pedidos, aprovar, cancelar, apagar — tudo num banco falso local. Se algo der errado, nada acontece com os dados reais. É um tabuleiro de ensaio.

2. **Velocidade e custo zero.** Não gasta cota do Firebase, não precisa de internet, e roda instantâneo. O Claude Code pode rodar centenas de testes sem custo.

3. **É o que permite o Claude Code testar sozinho.** Sem o emulador, ele só escreveria código no escuro (que foi o que deu errado antes). Com o emulador, ele executa cada funcionalidade e vê funcionar antes de dizer "pronto".

Pense nele como um simulador de voo: o piloto treina todas as manobras com segurança total antes de pilotar o avião real.

## Pré-requisito: Node.js

O Firebase precisa do Node.js (um ambiente que roda JavaScript fora do navegador). Para verificar se você já tem, abra o terminal e digite:

```
node --version
```

Se aparecer um número como `v20.x.x` ou superior, você já tem. Se der "comando não encontrado", instale:

- Acesse https://nodejs.org
- Baixe a versão **LTS** (a recomendada, botão à esquerda)
- Instale com as opções padrão (next, next, next)
- Feche e reabra o terminal e teste `node --version` de novo

## Pré-requisito: Java (necessário para o emulador do Firestore)

O emulador do Firestore roda sobre Java. Para verificar:

```
java -version
```

Se aparecer uma versão (qualquer 11 ou superior serve), está ok. Se não:

- Acesse https://adoptium.net
- Baixe o **Temurin JDK** (versão LTS, ex: 21)
- Instale com as opções padrão
- Feche e reabra o terminal e teste `java -version`

## Instalar o Firebase CLI

O Firebase CLI é a ferramenta de linha de comando do Firebase. Instale com:

```
npm install -g firebase-tools
```

O `-g` significa "global" (disponível em qualquer pasta). Pode demorar um minuto. Ao terminar, teste:

```
firebase --version
```

Deve aparecer um número de versão. Se aparecer, o Firebase CLI está instalado.

## Login no Firebase (uma vez)

```
firebase login
```

Isso abre o navegador para você entrar com sua conta Google (a mesma do seu projeto Firebase). Depois de autorizar, pode fechar o navegador. Isso conecta o CLI à sua conta.

## Pronto

Com Node, Java, Firebase CLI e login feitos, o ambiente está preparado. Você não precisa fazer mais nada aqui — o Claude Code cuida do resto a cada sessão. Esta instalação é única.

---

# PARTE 2 — SUBIR O EMULADOR (Claude Code, a cada sessão)

## Verificar a configuração do emulador

O projeto deve ter no `firebase.json` uma seção `emulators`. Se não tiver, ou se estiver incompleta, crie/ajuste para conter ao menos:

```json
{
  "emulators": {
    "auth":      { "port": 9099 },
    "firestore": { "port": 8080 },
    "functions": { "port": 5001 },
    "ui":        { "enabled": true, "port": 4000 },
    "hosting":   { "port": 5000 }
  }
}
```

A porta 4000 é a **interface visual** do emulador — uma página web onde dá para ver o banco, os usuários e os logs em tempo real. Muito útil para depurar.

## Subir o emulador

A partir da raiz do projeto:

```
firebase emulators:start
```

Isso sobe Auth, Firestore, Functions e Hosting localmente. Quando estiver pronto, o terminal mostra as URLs. As importantes:

- **http://localhost:5000** — o app Praxis rodando (é aqui que você testa a interface)
- **http://localhost:4000** — a interface visual do emulador (ver banco, usuários, logs)

Deixe esse terminal aberto rodando. Abra um segundo terminal para outros comandos, se precisar.

## Conectar o app ao emulador

O `firebase.js` do projeto precisa, **somente em ambiente local**, conectar-se aos emuladores em vez do Firebase real. O padrão é detectar se está em localhost e, se sim, conectar aos emuladores. Garanta que `firebase.js` tenha algo equivalente a:

```js
import { connectAuthEmulator } from '.../firebase-auth.js'
import { connectFirestoreEmulator } from '.../firebase-firestore.js'
import { connectFunctionsEmulator } from '.../firebase-functions.js'

if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  connectAuthEmulator(auth, 'http://localhost:9099')
  connectFirestoreEmulator(db, 'localhost', 8080)
  connectFunctionsEmulator(functions, 'localhost', 5001)
  console.log('🔧 Conectado aos emuladores locais')
}
```

Isso garante que, ao abrir localhost:5000, o app usa o banco falso local — e ao publicar de verdade, usa o Firebase real. Sem essa detecção, os testes locais tocariam dados reais, o que não queremos.

## Carregar o seed no emulador

O banco do emulador começa vazio a cada subida. Para popular com os dados de demonstração (necessário para testar qualquer coisa), o projeto precisa de um script de seed que escreva o conteúdo de `functions/seed.json` no Firestore do emulador.

Há duas formas, ambas aceitáveis:

**Forma A — Import/export do emulador (mais simples para o dia a dia):**
Uma vez que o banco esteja populado, exporte com:
```
firebase emulators:export ./_build/emulator-data
```
E nas próximas vezes suba já com os dados:
```
firebase emulators:start --import=./_build/emulator-data
```

**Forma B — Script de seed (canônico, recria do zero):**
Um pequeno script Node (`_build/seed-emulator.js`) que lê `functions/seed.json` e escreve no Firestore do emulador via SDK admin apontado para localhost. Rode-o com o emulador no ar.

O Claude Code deve implementar a Forma B no Estágio 0 (para ter um seed reproduzível) e pode usar a Forma A no dia a dia para velocidade.

## Persistência entre sessões

Para não perder o estado entre subidas durante o desenvolvimento, suba sempre com import e exporte ao encerrar:

```
firebase emulators:start --import=./_build/emulator-data --export-on-exit=./_build/emulator-data
```

A pasta `_build/emulator-data` guarda o estado. (Ela não deve ir para o Git — confirme que `_build/emulator-data` está no `.gitignore`.)

---

# PARTE 3 — DIVISÃO DE TESTES

Esta é a separação clara entre o que o Claude Code testa sozinho e o que só o desenvolvedor pode testar. O objetivo é maximizar o que o Claude Code cobre, deixando para o desenvolvedor apenas o que é tecnicamente impossível de testar no emulador.

## O Claude Code TESTA SOZINHO (no emulador) — a grande maioria

Tudo isto roda no emulador e o Claude Code deve verificar por conta própria:

- **Autenticação:** login, logout, esqueci a senha (fluxo de UI), proteção de rotas por perfil
- **Modo demo:** entrar no demo, seleção de idioma PT/EN, troca de textos
- **CRUD completo:** criar/editar pedidos, usuários, empresas, categorias, fornecedores
- **Fluxo de pedido inteiro:** criar → assumir → cotar → aprovar → comprar → entregar → pagar
- **Estados alternativos:** reprovar (com motivo), cancelar (com motivo), liberar claim
- **Concorrência:** simular dois cliques/abas no claim e na aprovação (runTransaction barrando o segundo)
- **Permissões:** cada um dos 6 perfis vê e pode exatamente o que deve (testar logando como cada um)
- **Dashboard:** métricas corretas, gráficos renderizando, Aprovador sem dados financeiros
- **Notificações in-app:** criação do documento, badge, marcar lida, marcar todas, tempo real (onSnapshot atualizando sozinho)
- **Filtros, busca, toggle kanban/lista, ordenação**
- **Exports:** Excel e PDF gerando arquivo com os dados filtrados
- **Cloud Functions de gatilho (onPedidoStatusChange, setUserClaims):** disparar a mudança no emulador e ver a notificação ser criada e os Custom Claims serem setados — tudo visível na UI do emulador (localhost:4000)
- **Validações de formulário e sanitização de input**
- **Responsividade:** redimensionar a janela do navegador para 375px e verificar kanban com scroll, tabelas viram cards, modal bottom-sheet
- **Tema dark/light:** alternar e verificar em todas as telas, persistência, cores da marca AFN
- **Estados de erro:** rota inválida (404), pedido inexistente, ação sem permissão

## SÓ O DESENVOLVEDOR pode testar — o mínimo indispensável

Estas coisas dependem de serviços externos reais ou de julgamento humano, e não há como o Claude Code validar no emulador. O Claude Code deve, ao fim de cada estágio, **listar quais destes itens se aplicam e ensinar o passo a passo**:

- **E-mail real do Resend chegando na caixa de entrada.** O emulador de Functions executa o código que *chama* o Resend, mas não envia e-mail de verdade nem confirma entrega. Só o desenvolvedor, com a chave Resend configurada e deploy real (ou rodando a function apontada para o Resend real), confirma que o e-mail chega, com layout correto, link funcionando.
- **Funções agendadas disparando no horário real** (`checkClaimTimeout`, `checkParcelasVencendo`, `checkParcelasVencidas`, `demoReset`). O emulador não dispara agendamentos por relógio. O Claude Code pode testar a *lógica* da função chamando-a manualmente, mas confirmar que ela roda sozinha no horário certo só acontece no Firebase real, observando ao longo do tempo.
- **Login e comportamento em domínio publicado real** (HTTPS, domínio próprio, cookies de produção).
- **Custom Claims propagando em produção** (no emulador funciona, mas vale uma conferência no ambiente real após deploy).
- **O olhar final de design no monitor do desenvolvedor.** Cores, contraste, "sensação" geral — o Claude Code garante que o CSS está correto conforme spec, mas a aprovação estética final é humana e subjetiva.
- **Teste em dispositivos físicos reais** (um celular de verdade, não só a janela redimensionada).

## Princípio da divisão

Se dá para testar no emulador, **é responsabilidade do Claude Code** e ele não deve empurrar para o desenvolvedor. O desenvolvedor só recebe o que é genuinamente impossível automatizar: serviços externos reais, tempo real de agendadores, e julgamento estético humano.

---
*Fim do guia de ambiente.*
