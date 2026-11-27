// Equipamentos › Contagem (27/11/2026): o inventário de uma unidade. A
// pessoa escolhe a unidade, anda por ela e marca cada aparelho que encontra
// (tocando na lista ou lendo a etiqueta com a câmera). No fim, o Praxis grava
// o que foi encontrado, o que faltou e o que estava fora do lugar. A contagem
// em andamento fica no aparelho, para não perder nada se a tela fechar.
import { db, doc, setDoc, getDocs, serverTimestamp, marcaDemo } from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter, atualizarLateral, navegar } from './app.js'
import { sessao } from './estado.js'
import { prxToast, prxConfirm, mostrarSpinner, esconderSpinner, exigirConexao } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { t, idioma } from './constants.js'
import { esc } from './utils.js'
import { tf, cabecalho, resumoCarregando, revelarItemLateral } from './config-comum.js'
import { icone } from './icones.js'
import { papelEquip } from './modulos.js'
import { ST_EQUIP, conferirContagem } from './equip-regras.js'
import { consultaContagens, novoId, msDe } from './modulos-dados.js'
import { carregarBase, rotuloTipo } from './equipamentos.js'
import { lerQrNoApp, temLeitorQr } from './presenca.js'

const G = { base: null, unidade: '', marcados: new Set(), contagens: [] }
const _chave = id => `praxis_contagem_${id}`
const _guardar = () => { try { localStorage.setItem(_chave(G.unidade), JSON.stringify([...G.marcados])) } catch { /* sem armazenamento */ } }
const _recuperar = id => { try { return new Set(JSON.parse(localStorage.getItem(_chave(id)) || '[]')) } catch { return new Set() } }
const _esquecer = id => { try { localStorage.removeItem(_chave(id)) } catch { /* */ } }
const _dt = v => { const ms = msDe(v); return ms ? new Date(ms).toLocaleString(idioma() === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '' }

export async function renderContagem() {
  const mexe = ['responsavel', 'gestor'].includes(papelEquip(sessao.usuario))
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('contagem')}
      <main class="main-content cfg-pagina ct-pagina">
        ${cabecalho(t('eqContagem'), { resumoId: 'ct-resumo', resumo: resumoCarregando('ctDesc') })}
        <div class="cf-filtros">
          <div class="form-group"><label for="ct-unidade">${t('eqUnidade')}</label><select id="ct-unidade"></select></div>
        </div>
        <div id="ct-corpo" aria-busy="true"><div class="grupo-lista">${'<div class="sv-item is-esqueleto"><span class="skeleton skeleton-text"></span></div>'.repeat(4)}</div></div>
      </main>
      ${renderFooter()}
    </div>`
  initTopbarEvents(false)
  atualizarLateral({ ativo: 'contagem' })
  revelarItemLateral()
  renderNotificacoes()
  G.base = await carregarBase()
  try {
    G.contagens = (await getDocs(consultaContagens())).docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (msDe(b.em) || 0) - (msDe(a.em) || 0))
  } catch (e) { console.warn(e); G.contagens = [] }
  const comAparelhos = new Set(G.base.lista.map(e => e.unidadeId))
  const unidades = G.base.unidades.filter(u => comAparelhos.has(u.id))
  const sel = document.getElementById('ct-unidade')
  const pedida = new URLSearchParams(location.search).get('u')
  G.unidade = unidades.some(u => u.id === pedida) ? pedida : (unidades.some(u => u.id === G.unidade) ? G.unidade : unidades[0]?.id || '')
  sel.innerHTML = unidades.map(u => `<option value="${esc(u.id)}"${u.id === G.unidade ? ' selected' : ''}>${esc(u.nome)}</option>`).join('')
  sel.disabled = !unidades.length
  sel.addEventListener('change', () => { G.unidade = sel.value; G.marcados = _recuperar(G.unidade); _desenhar(mexe) })
  G.marcados = _recuperar(G.unidade)
  _desenhar(mexe)
}

// O que se espera encontrar: os aparelhos da unidade que não estão baixados nem em conserto
const _esperados = () => G.base.lista.filter(e => e.unidadeId === G.unidade && ![ST_EQUIP.BAIXADO, ST_EQUIP.CONSERTO].includes(e.status))
const _porId = () => Object.fromEntries(G.base.lista.map(e => [e.id, e]))

function _desenhar(mexe) {
  const corpo = document.getElementById('ct-corpo')
  if (!corpo) return
  corpo.removeAttribute('aria-busy')
  if (!G.unidade) {
    document.getElementById('ct-resumo').textContent = t('ctDesc')
    corpo.innerHTML = `<div class="sv-vazio-bloco"><p class="sv-vazio-tit">${t('ctSemAparelhos')}</p>
      <p>${t('ctSemAparelhosTexto')}</p></div>`
    return
  }
  const esperados = _esperados().sort((a, b) => (a.setor || '').localeCompare(b.setor || '', 'pt-BR') || a.etiqueta.localeCompare(b.etiqueta))
  const r = conferirContagem(esperados, [...G.marcados], _porId())
  const fora = r.foraDoLugar.map(id => _porId()[id]).filter(Boolean)
  const un = G.base.unidades.find(u => u.id === G.unidade)
  document.getElementById('ct-resumo').textContent = tf('ctResumo', { a: r.encontrados.length, b: esperados.length, unidade: un?.nome || '' })
  const ultima = G.contagens.find(c => c.unidadeId === G.unidade)
  const pct = esperados.length ? Math.round(r.encontrados.length / esperados.length * 100) : 0
  corpo.innerHTML = `
    ${mexe ? `
    <div class="ct-barra-acoes">
      <div class="eq-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${esperados.length}" aria-valuenow="${r.encontrados.length}" aria-label="${t('ctAndamento')}">
        <span class="eq-barra-cheia" data-pct="${pct}"></span></div>
      <div class="ct-botoes">
        ${temLeitorQr() ? `<button type="button" class="btn-secondary" id="ct-ler">${icone('qr', 16)}${t('ctLerEtiqueta')}</button>` : ''}
        <div class="search-input-wrap ct-busca">${icone('busca', 15)}<input type="search" id="ct-etiqueta" placeholder="${t('ctDigiteEtiqueta')}" aria-label="${t('ctDigiteEtiqueta')}" autocapitalize="characters" enterkeyhint="done"></div>
      </div>
    </div>` : ''}
    <section class="sv-grupo">
      <h2 class="sv-grupo-cab"><span>${t('ctEsperados')}</span><span>${tf('prDe', { a: r.encontrados.length, b: esperados.length })}</span></h2>
      <ul class="grupo-lista ct-lista">${esperados.map(e => {
        const ok = G.marcados.has(e.id)
        return `<li><label class="sv-item ct-item${ok ? ' achado' : ''}">
          <input type="checkbox" class="ct-check" value="${esc(e.id)}"${ok ? ' checked' : ''}${mexe ? '' : ' disabled'}>
          <span class="eq-etiqueta">${esc(e.etiqueta)}</span>
          <span class="sv-item-tit">${esc(e.descricao)}</span>
          <span class="sv-item-sub">${esc([rotuloTipo(e.tipo), e.setor].filter(Boolean).join(' · '))}</span>
        </label></li>`
      }).join('')}</ul>
    </section>
    ${fora.length ? `
    <section class="sv-grupo cf-ruim">
      <h2 class="sv-grupo-cab"><span>${t('ctForaDoLugar')}</span><span>${fora.length}</span></h2>
      <div class="grupo-lista">${fora.map(e => `
        <a class="sv-item" href="?tela=equipamento&id=${encodeURIComponent(e.id)}" data-navegar="equipamento" data-id="${esc(e.id)}">
          <span class="eq-etiqueta">${esc(e.etiqueta)}</span><span class="sv-item-tit">${esc(e.descricao)}</span>
          <span class="sv-item-sub">${esc(tf('ctDeveriaEstar', { unidade: e.unidadeNome || '' }))}</span>${icone('setaDir', 14)}</a>`).join('')}</div>
      <p class="np-dica">${t('ctForaDica')}</p>
    </section>` : ''}
    ${mexe ? `<div class="ct-fim">
      <button type="button" class="btn-primary" id="ct-concluir"${esperados.length || fora.length ? '' : ' disabled'}>${t('ctConcluir')}</button>
      ${G.marcados.size ? `<button type="button" class="btn-secondary" id="ct-recomecar">${t('ctRecomecar')}</button>` : ''}
    </div>` : ''}
    ${_historico()}
    ${ultima ? '' : `<p class="np-dica">${t('ctNuncaContada')}</p>`}`
  corpo.querySelectorAll('[data-pct]').forEach(el => el.style.setProperty('width', `${el.dataset.pct}%`))
  corpo.querySelectorAll('.ct-check').forEach(c => c.addEventListener('change', () => {
    if (c.checked) G.marcados.add(c.value); else G.marcados.delete(c.value)
    _guardar(); _desenhar(mexe)
  }))
  document.getElementById('ct-ler')?.addEventListener('click', async () => { const txt = await lerQrNoApp(); if (txt) _marcarLido(txt, mexe) })
  const campo = document.getElementById('ct-etiqueta')
  campo?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _marcarLido(campo.value, mexe) } })
  document.getElementById('ct-concluir')?.addEventListener('click', () => _concluir(esperados))
  document.getElementById('ct-recomecar')?.addEventListener('click', async () => {
    if (!await prxConfirm(t('ctRecomecar'), t('ctRecomecarTexto'))) return
    G.marcados = new Set(); _esquecer(G.unidade); _desenhar(mexe)
  })
}

// O texto lido (o endereço do QR da etiqueta) ou digitado (AC-0123)
function _marcarLido(texto, mexe) {
  const s = String(texto || '').trim()
  let e = null
  try { const id = new URL(s).searchParams.get('id'); if (id) e = G.base.lista.find(x => x.id === id) } catch { /* não é endereço */ }
  if (!e) e = G.base.lista.find(x => x.etiqueta.toUpperCase() === s.toUpperCase().replace(/\s+/g, ''))
  if (!e) { prxToast(t('ctNaoAchei'), 'warning'); return }
  if (G.marcados.has(e.id)) { prxToast(tf('ctJaMarcado', { etiqueta: e.etiqueta }), 'info'); return }
  G.marcados.add(e.id)
  _guardar()
  prxToast(e.unidadeId === G.unidade ? tf('ctMarcado', { etiqueta: e.etiqueta }) : tf('ctMarcadoFora', { etiqueta: e.etiqueta, unidade: e.unidadeNome || '' }),
    e.unidadeId === G.unidade ? 'success' : 'warning')
  _desenhar(mexe)
}

async function _concluir(esperados) {
  const r = conferirContagem(esperados, [...G.marcados], _porId())
  if (r.faltando.length && !await prxConfirm(t('ctConcluir'), tf(r.faltando.length === 1 ? 'ctConfirmarFaltaUm' : 'ctConfirmarFalta', { n: r.faltando.length }), t('ctConcluir'))) return
  if (!exigirConexao()) return
  const un = G.base.unidades.find(u => u.id === G.unidade)
  const etq = ids => ids.map(id => _porId()[id]?.etiqueta).filter(Boolean)
  mostrarSpinner()
  try {
    const u = sessao.usuario
    await setDoc(doc(db, 'contagens', novoId('contagens')), {
      empresaId: un.empresaId, unidadeId: un.id, unidadeNome: un.nome, porId: u.id, porNome: u.nome || '', em: serverTimestamp(),
      encontrados: etq(r.encontrados), faltando: etq(r.faltando), foraDoLugar: etq(r.foraDoLugar), total: esperados.length, ...marcaDemo(),
    })
    _esquecer(G.unidade)
    G.marcados = new Set()
    prxToast(r.faltando.length ? tf('ctGravadaFalta', { n: r.faltando.length }) : t('ctGravadaTudo'), r.faltando.length ? 'warning' : 'success', 6000)
    navegar('contagem', { u: un.id }, { substituir: true })
  } catch (e) {
    console.error(e)
    prxToast(e?.code === 'permission-denied' ? t('eqSemPermissao') : t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}

function _historico() {
  const lista = G.contagens.filter(c => c.unidadeId === G.unidade).slice(0, 12)
  if (!lista.length) return ''
  return `
    <section class="sv-grupo">
      <h2 class="sv-grupo-cab"><span>${t('ctAnteriores')}</span><span>${lista.length}</span></h2>
      <ol class="sv-registro ct-historico">${lista.map(c => `
        <li><span class="sv-reg-quando">${esc(_dt(c.em))}</span>
          <span class="sv-reg-o-que"><strong>${esc(c.porNome || '')}</strong> ${esc(tf('ctLinhaHistorico', { a: (c.encontrados || []).length, b: c.total || 0 }))}
          ${(c.faltando || []).length ? `<span class="ct-faltou">${esc(tf('ctFaltaram', { lista: c.faltando.join(', ') }))}</span>` : ''}
          ${(c.foraDoLugar || []).length ? `<span class="ct-faltou">${esc(tf('ctForaLista', { lista: c.foraDoLugar.join(', ') }))}</span>` : ''}</span></li>`).join('')}</ol>
    </section>`
}
