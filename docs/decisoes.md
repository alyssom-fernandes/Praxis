# Registro de decisões

Cada decisão de arquitetura do Praxis, com o motivo e o que se perde. Quando uma
decisão mudar, a entrada antiga fica, com a data e o que a substituiu.

## 1. JavaScript sem empacotador

**Decisão:** módulos ES servidos como estão, sem bundler, sem etapa de build.
**Por quê:** o código publicado é o mesmo que se lê no repositório; não há
ferramenta a manter nem mapa de fontes. O carregamento em cascata é resolvido
com `modulepreload` (index.html) e com as telas importadas sob demanda.
**O que se perde:** a minificação (o Lighthouse aponta cerca de 45 KB a ganhar
entre JS e CSS) e a eliminação de código morto do SDK do Firebase.

## 2. Firebase no plano gratuito (Spark)

**Decisão:** Hosting, Firestore e Authentication no plano gratuito; as Cloud
Functions ficam prontas no repositório, mas a demonstração não depende delas.
**Por quê:** a demo pública não pode gerar custo.
**O que se perde:** envio de arquivos (o Storage exige o Blaze desde 03/02/2026),
avisos por push e e-mail. Ver `DEMO_ENVIA_ARQUIVOS` em `js/constants.js`.

## 3. Regras do Firestore como fonte da verdade das permissões

**Decisão:** cada mudança de etapa é validada em `firestore.rules` (quem pode,
de qual etapa para qual, com quais campos), com 69 testes no emulador.
**Por quê:** a tela pode ser contornada; o servidor, não.

## 4. A entrada vem escrita no index.html (18/11/2026)

**Decisão:** `scripts/gerar-entrada.mjs` desenha a tela de entrada com o
próprio `renderLogin` num navegador e escreve o HTML no `index.html`; o
JavaScript só liga os eventos (`mostrarEntrada`, js/auth.js). Quem tem sessão ou
escolheu o inglês vê o splash, e a cópia estática fica escondida.
**Por quê:** a primeira pintura deixa de esperar JavaScript. Medido: maior
pintura da primeira visita de 3,4 s para 1,7 s (celular simulado, 4G lento, CPU
4x); Lighthouse de 76 para 97 no mesmo servidor local.
**O que se perde:** uma cópia a manter; o teste de celular falha se ela ficar
diferente do que o app desenha (`npm run gerar-entrada`).

## 5. O Firebase sob demanda na entrada (18/11/2026)

**Decisão:** `js/entrada.js` é o ponto de entrada e não importa o Firebase; o
`js/auth.js` o carrega em paralelo e cada ação espera por ele.
**Por quê:** a tela de entrada não precisa do SDK (cerca de 250 KB) para aparecer.

## 6. Abertura rápida e sem internet (18/11/2026)

**Decisão:** quem já entrou no aparelho abre com o perfil da cópia local do
Firestore, o quadro com a última lista de pedidos guardada no navegador e
empresas e categorias também guardadas; o servidor confere logo depois. Erro de
rede nunca tira a pessoa da conta.
**Por quê:** antes, cada abertura esperava duas idas à rede, e sem internet a
falha levava ao "sair", que apagava a cópia local. Medido: reabrir até o quadro
de 4,8 s para 2,4 s; sem internet, de "não abre" para 0,4 s.
**O que se perde:** por alguns segundos o quadro mostra a lista da última
visita; o que mudou desde então desliza para a etapa nova quando chega.
Tudo isso sai junto com a sessão (prefixo `praxis_memo_`).

## 7. Service worker com versão fechada (18/11/2026)

**Decisão:** na instalação, o app inteiro (61 arquivos) vai para um cache com o
nome da versão (um resumo do conteúdo, `scripts/gerar-sw.mjs`); os arquivos
saem sempre do cache da versão; a nova só assume com o toque em "Atualizar" ou
com o app fechado. Registrado só depois da primeira tela da conta.
**Por quê:** abrir sem rede e sem esperar a rede, sem nunca misturar módulos de
duas versões (o problema do antigo "cache primeiro", trocado por "rede primeiro").
**O que se perde:** uma publicação só chega a quem tocar em "Atualizar" ou
reabrir o app.

## 8. Estilo sem atributo `style` e CSP sem `'unsafe-inline'` (18/11/2026)

**Decisão:** as telas escrevem `data-estilo="…"`; um observador em `js/ui.js`
passa o valor pelo CSSOM, que a CSP permite. Os dois blocos `<style>` fixos (o
splash e a 404) entram na CSP pelo hash, gerado por `scripts/gerar-sw.mjs`.
**Por quê:** uma injeção de HTML não consegue mais aplicar estilo (sobrepor um
botão falso, esconder um aviso).
**O que se perde:** quem escrever `style="…"` num módulo quebra o teste
(`tests/pwa.test.mjs`).

## 9. Estado de cada tela num objeto só (18/11/2026)

**Decisão:** as telas grandes foram divididas em módulos de até 1.200 linhas
(detalhe em quatro, pedidos em três, relatórios em dois), e o estado de cada
uma vive num objeto (`D` em `detalhe-estado.js`, `Q` em `pedidos-estado.js`,
`R` em `relatorios-estado.js`).
**Por quê:** os módulos ES não deixam outro módulo trocar uma variável
importada; o objeto deixa, e o estado fica num lugar visível.

## 10. Textos em dicionários, inglês sob demanda (18/11/2026)

**Decisão:** `js/textos-pt.js` vem com o app; `js/textos-en.js` só é baixado por
quem escolhe o inglês (na entrada ou em Ajustes, guardado no navegador).
**Por quê:** o inglês era baixado por todos, e ninguém conseguia escolhê-lo.

## 11. Os ajustes por largura fora da primeira pintura (19/11/2026)

**Decisão:** o `css/themes.css` (os ajustes de cada tela por largura e tema) é
baixado como o `css/telas.css`: sem segurar a primeira pintura, e o app espera
os dois antes da primeira tela da conta (`js/entrada.js`). As regras de toque
que a entrada usa (campos de 16 px e 48 px, botões de 44 px) foram para o
`css/base.css`.
**Por quê:** a entrada não usa o resto do arquivo. Medido: maior pintura da
primeira visita de 1,58 s para 1,39 s (celular simulado, 4G lento, CPU 4x,
mediana de três rodadas).
**O que se perde:** uma regra de toque nova precisa ir para o `base.css`.
Conferido: a entrada fica igual, pixel a pixel, com e sem o `themes.css`, a 390,
768 e 1440 px.

## 12. A demo num projeto Firebase próprio (26/11/2026)

**Decisão:** quando configurada (`js/config.js`), a conta de demonstração roda
num projeto Firebase separado; o projeto real fica só com os dados da empresa.
**Por quê:** a renovação diária da demo regravava centenas de documentos no
mesmo banco e dividia com ele a cota gratuita de leituras e gravações.
**O que se perde:** dois projetos para manter (regras publicadas nos dois).

## 13. Menos leituras: o quadro escuta o que está em andamento (26/11/2026)

**Decisão:** o quadro escuta os pedidos em andamento e os 100 encerrados mais
recentes; "Ver os antigos" traz o resto sob pedido. O "visto por" vai num
documento da pessoa (`lidos/{uid}`), e os cadastros são relidos do servidor no
máximo a cada 10 minutos.
**Por quê:** no plano gratuito, cada abertura do quadro lia todos os pedidos já
encerrados, e cada pedido aberto regravava o próprio documento.
**O que se perde:** a busca por um pedido antigo pede um toque a mais.

## 14. Acesso sem e-mail (26/11/2026)

**Decisão:** a pessoa sem e-mail entra com um usuário (`joao.oficina`), guardado
no Auth como `joao.oficina@usuarios.praxis.invalid`. O gestor cria a conta numa
instância à parte do Firebase (sem derrubar a própria sessão) com uma senha
inicial que aparece só uma vez, e a pessoa troca a senha no primeiro acesso.
**Por quê:** parte da equipe tem celular mas não tem e-mail, e o plano gratuito
não tem Cloud Functions para criar contas no servidor.
**O que se perde:** não há "esqueci a senha" para essas contas (o domínio
`.invalid` não recebe e-mail); o gestor cria um acesso novo.

## 15. Pedido guardado sem internet (26/11/2026)

**Decisão:** sem conexão, o pedido novo fica no aparelho (`localStorage`, por
pessoa) e é enviado sozinho quando a conexão volta, com o número dado nesse
momento.
**Por quê:** a gravação do pedido usa uma transação (o número sequencial), que
o Firestore não faz sem internet.
**O que se perde:** o pedido só ganha número e aparece para os outros depois do
envio; o resumo do quadro mostra quantos estão "a enviar".

## 16. Um estilo só, com cara de app (27/11/2026)

**Decisão:** o celular e o computador passam ao mesmo estilo, o dos apps da
Apple: cantos arredondados (10 nos grupos, 8 nos campos e botões, 12 nas
janelas), listas agrupadas, barras translúcidas, "‹ Voltar" no lugar das
migalhas, o título de tela em caixa baixa e, no celular, as folhas que fecham
arrastando, o título que encolhe e o texto de 15 a 17 px.
**Por quê:** no iPhone o Praxis lia como site, e o computador num estilo e o
celular em outro seria pior. A paleta, as fontes, o Λ, a régua das etapas e os
numerais ficam: são a identidade.
**O que se perde:** os cantos retos da "pedra cortada" e o fio de tinta no alto
das janelas. O alto do painel de decisão e a organização dos cartões do quadro
ficaram como eram, a pedido do dono.

