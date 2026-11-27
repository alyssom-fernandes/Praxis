// A tela que a câmera do celular abre ao ler a placa de uma unidade
// (?tela=qr&u={unidade}&c={código}, js/unidades.js). Para o técnico de uma
// prestadora: registra a chegada no chamado daquela unidade (ou a saída, se
// ele já escreveu o relatório); com mais de um, ele escolhe. Para a gente da
// empresa: mostra a unidade e os chamados abertos nela.
import { db, doc, getDoc, getDocs } from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter, atualizarLateral, navegar } from './app.js'
import { sessao } from './estado.js'
import { renderNotificacoes } from './notificacoes.js'
import { t } from './constants.js'
import { esc } from './utils.js'
import { tf } from './config-comum.js'
import { icone } from './icones.js'
import { papelServicos } from './modulos.js'
import { ST, numeroDoChamado } from './servicos-regras.js'
import { consultaChamados } from './modulos-dados.js'
import { registrarPresenca, rascunhoDaConclusao } from './presenca.js'
import { rotuloDoStatus } from './servicos.js'

export async function renderQr() {
  const p = new URLSearchParams(location.search)
  const unidadeId = p.get('u') || '', codigo = p.get('c') || ''
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('qr')}
      <main class="main-content"><div class="sv-qr" id="qr-root"><div class="sv-carregando"><span class="skeleton skeleton-title"></span></div></div></main>
      ${renderFooter()}
    </div>`
  initTopbarEvents(false)
  atualizarLateral({ ativo: 'servicos' })
  renderNotificacoes()
  const root = document.getElementById('qr-root')
  const papel = papelServicos(sessao.usuario)
  let unidade = null
  try {
    const s = await getDoc(doc(db, 'unidades', unidadeId))
    if (s.exists()) unidade = { id: s.id, ...s.data() }
  } catch { /* fora das unidades da pessoa */ }
  let chamados = []
  try {
    chamados = (await getDocs(consultaChamados())).docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.unidadeId === unidadeId)
  } catch (e) { console.warn(e) }
  const nome = unidade?.nome || chamados[0]?.unidadeNome || t('svUnidadeDesconhecida')
  // Quem cuida das unidades lê o código e vê na hora se a placa é antiga; para
  // a prestadora, as regras conferem a prova ao registrar
  let placaOk = true
  try {
    const s = await getDoc(doc(db, 'unidades', unidadeId, 'privado', 'placa'))
    if (s.exists()) placaOk = s.data().codigo === codigo
  } catch { /* sem acesso ao código: as regras conferem */ }
  if (!placaOk) {
    root.innerHTML = _bloco('erro', t('svPlacaAntiga'), t('svPlacaAntigaTexto'))
    return
  }
  if (papel === 'prestador') {
    const chegar = chamados.filter(c => [ST.AGENDADO, ST.PREVISTA, ST.ABERTO, ST.CONTESTADO].includes(c.status))
    const sair = chamados.filter(c => c.status === ST.ATENDIMENTO && c.tecnicoId === sessao.usuario.id)
    const itens = [
      ...sair.map(c => ({ c, momento: rascunhoDaConclusao(c.id)?.relatorio ? 'saida' : 'escrever' })),
      ...chegar.map(c => ({ c, momento: 'chegada' })),
    ]
    if (!itens.length) {
      root.innerHTML = _bloco('neutro', tf('svNaUnidade', { nome }), t('svNadaParaRegistrar'),
        `<button type="button" class="btn-secondary" data-navegar="servicos">${t('svVerChamados')}</button>`)
      return
    }
    root.innerHTML = `
      <section class="decisao tom-voce sv-qr-cartao">
        <div class="decisao-topo"><div class="decisao-texto">
          <p class="decisao-rotulo">${icone('qr', 16)} ${t('svPlacaConferida')}</p>
          <h1 class="decisao-titulo">${esc(nome)}</h1>
          <p class="decisao-desc">${itens.length > 1 ? t('svQrEscolha') : itens[0].momento === 'escrever' ? t('svQrEscrevaAntes') : t('svQrUmChamado')}</p>
        </div></div>
        <ul class="sv-qr-lista">${itens.map(({ c, momento }) => `
          <li>
            <div class="sv-qr-ch"><span class="sv-item-tit">${esc(c.titulo || t('svVisita'))}</span>
              <span class="sv-item-sub">${esc([c.numero ? numeroDoChamado(c.numero) : t('svVisita'), rotuloDoStatus(c)].join(' · '))}</span></div>
            ${momento === 'escrever'
              ? `<a class="btn-secondary" href="?tela=chamado&id=${encodeURIComponent(c.id)}" data-navegar="chamado" data-id="${esc(c.id)}">${t('svEscreverRelatorio')}</a>`
              : `<button type="button" class="btn-primary" data-registrar="${esc(c.id)}" data-momento="${momento}">${momento === 'saida' ? t('svRegistrarSaida') : t('svRegistrarChegada')}</button>`}
          </li>`).join('')}</ul>
      </section>`
    root.querySelectorAll('[data-registrar]').forEach(b => b.addEventListener('click', async () => {
      const c = chamados.find(x => x.id === b.dataset.registrar)
      b.disabled = true
      const ok = await registrarPresenca(c, b.dataset.momento, { via: 'qr', codigo, unidade })
      if (ok) navegar('chamado', { id: c.id }, { substituir: true })
      else b.disabled = false
    }))
    return
  }
  // A gente da empresa: a unidade e o que está aberto nela
  const abertos = chamados.filter(c => ![ST.CONFIRMADO, ST.CANCELADO, ST.NAO_REALIZADA, ST.PREVISTA].includes(c.status))
  root.innerHTML = _bloco('neutro', nome, abertos.length ? tf('svAbertosNaUnidade', { n: abertos.length }) : t('svNadaAbertoNaUnidade'),
    abertos.map(c => `<a class="sv-item" href="?tela=chamado&id=${encodeURIComponent(c.id)}" data-navegar="chamado" data-id="${esc(c.id)}">
      <span class="sv-item-tit">${esc(c.titulo || t('svVisita'))}</span><span class="sv-item-sub">${esc(c.fornecedorNome || '')}</span>
      <span class="sv-item-dir"><span class="sv-estado">${esc(rotuloDoStatus(c))}</span></span>${icone('setaDir', 14)}</a>`).join(''))
}

function _bloco(tom, titulo, texto, extra = '') {
  return `<section class="decisao tom-${tom === 'erro' ? 'erro' : 'neutro'} sv-qr-cartao">
    <div class="decisao-topo"><div class="decisao-texto">
      <p class="decisao-rotulo">${icone('qr', 16)} ${tom === 'erro' ? t('svPlacaNaoConfere') : t('svPlacaDaUnidade')}</p>
      <h1 class="decisao-titulo">${esc(titulo)}</h1><p class="decisao-desc">${esc(texto)}</p>
    </div></div>${extra ? `<div class="sv-qr-extra">${extra}</div>` : ''}</section>`
}
