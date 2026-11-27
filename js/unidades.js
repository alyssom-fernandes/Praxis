// Administração › Unidades (27/11/2026): os lugares de cada empresa (postos,
// lojas, escritório), que Serviços e Equipamentos usam. Cada unidade tem um
// código aleatório que vai no QR da placa: o técnico lê ao chegar e ao sair
// (js/qr-tela.js), e a localização registrada aqui mede a distância dele. O
// código fica em unidades/{id}/privado/placa, que a prestadora não lê.
// Cuidam das unidades: quem administra (Compras) e os gestores de Serviços e
// de Equipamentos (js/modulos.js, cuidaDasUnidades).
import { db, collection, doc, getDoc, getDocs, setDoc, serverTimestamp, consulta } from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter, atualizarLateral } from './app.js'
import { sessao } from './estado.js'
import { prxToast, mostrarSpinner, esconderSpinner, abrirModal, fecharModal, initModal, carregarBiblioteca } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { t } from './constants.js'
import { esc, empresasDoUsuario } from './utils.js'
import { gravarAuditado } from './auditoria.js'
import {
  tf, plural, cabecalho, resumoCarregando, botaoNovo, linhaVazia, linhasEsqueleto,
  marcarErro, limparErro, limparErros, focarPrimeiroErro, ligarInterruptor, definirInterruptor, revelarItemLateral,
} from './config-comum.js'
import { consultaUnidades } from './modulos-dados.js'
import { svgQR, matrizQR } from './qr.js'
import { icone } from './icones.js'

let _unidades = []
let _empresas = []
let _editando = null
let _local = null   // { lat, lng, precisaoM } da última leitura do GPS

// O endereço que vai no QR da placa (a câmera do celular abre o Praxis)
export function enderecoDoQrDaUnidade(u, codigo) {
  return `${location.origin}/?tela=qr&u=${encodeURIComponent(u.id)}&c=${encodeURIComponent(codigo)}`
}
const _refPlaca = id => doc(db, 'unidades', id, 'privado', 'placa')
// O código da placa (só quem cuida das unidades lê); sem ele, nasce um novo
async function _codigoDaPlaca(u) {
  const s = await getDoc(_refPlaca(u.id))
  if (s.exists() && s.data().codigo) return s.data().codigo
  const codigo = _codigoNovo()
  await setDoc(_refPlaca(u.id), { codigo, ...(sessao.isDemo ? { isDemo: true } : {}) })
  return codigo
}
// Código aleatório da placa (as regras pedem de 12 a 40 caracteres)
function _codigoNovo() {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('')
}

export async function renderUnidades() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('unidades', true)}
      <main class="main-content cfg-pagina un-pagina">
        ${cabecalho(t('unUnidades'), {
          resumoId: 'un-resumo', resumo: resumoCarregando('unDesc'),
          acao: botaoNovo('btn-nova-unidade', t('unNova'), t('cfgNovaCurto')),
        })}
        <div class="cfg-livro">
          <table class="cfg-tabela un-tabela">
            <thead><tr>
              <th class="c-nome">${t('unColUnidade')}</th>
              <th class="c-empresa">${t('unColEmpresa')}</th>
              <th class="c-local">${t('unColLocal')}</th>
              <th class="c-acoes"><span class="sr-only">${t('cfgColAcoes')}</span></th>
            </tr></thead>
            <tbody id="tbody-unidades">${linhasEsqueleto(4, 4)}</tbody>
          </table>
        </div>
      </main>
      ${renderFooter()}
    </div>
    ${_modalUnidade()}
    ${_modalPlaca()}`
  initTopbarEvents(true)
  atualizarLateral({ ativo: 'unidades' })
  revelarItemLateral()
  renderNotificacoes()
  _ligar()
  await _carregar()
}

function _modalUnidade() {
  return `
    <div class="modal-overlay" id="modal-unidade" role="dialog" aria-modal="true" aria-labelledby="un-titulo">
      <div class="modal cfg-modal cfg-modal-sm">
        <div class="modal-header">
          <h2 id="un-titulo">${t('unNova')}</h2>
          <button class="btn-icon" data-close-modal aria-label="${t('fechar')}">${icone('x', 16)}</button>
        </div>
        <div class="modal-body">
          <div class="form-grid cfg-form">
            <div class="form-group" data-campo="un-nome">
              <label for="un-nome">${t('unNome')} <span class="cfg-req" aria-hidden="true">*</span></label>
              <input type="text" id="un-nome" maxlength="80" autocomplete="off" placeholder="${t('unNomeExemplo')}">
            </div>
            <div class="form-group" data-campo="un-empresa">
              <label for="un-empresa">${t('unColEmpresa')} <span class="cfg-req" aria-hidden="true">*</span></label>
              <select id="un-empresa"></select>
            </div>
            <div class="form-group" data-campo="un-endereco">
              <label for="un-endereco">${t('unEndereco')} <span class="np-opcional">${t('opcional')}</span></label>
              <input type="text" id="un-endereco" maxlength="160" autocomplete="off">
            </div>
            <div class="form-group" data-campo="un-local">
              <span class="cfg-rotulo-campo">${t('unLocalizacao')}</span>
              <p class="form-hint" id="un-local-txt">${t('unLocalSem')}</p>
              <button type="button" class="btn-secondary btn-sm" id="un-usar-local">${icone('local', 16)}${t('unUsarLocal')}</button>
            </div>
            <div class="form-group" data-campo="un-ativa" id="un-ativa-grupo">
              <span class="cfg-rotulo-campo" id="un-ativa-rotulo">${t('cfgAcesso')}</span>
              <div class="toggle-wrap cfg-interruptor" id="un-ativa-wrap" role="switch" tabindex="0" aria-checked="true" aria-labelledby="un-ativa-rotulo un-ativa-label">
                <div class="toggle on"></div><span class="toggle-label" id="un-ativa-label">${t('unAtiva')}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>${t('btnCancelar')}</button>
          <button class="btn-primary" id="un-salvar">${t('salvarLabel')}</button>
        </div>
      </div>
    </div>`
}

function _modalPlaca() {
  return `
    <div class="modal-overlay" id="modal-placa" role="dialog" aria-modal="true" aria-labelledby="placa-titulo">
      <div class="modal cfg-modal cfg-modal-sm">
        <div class="modal-header">
          <div><h2 id="placa-titulo">${t('unPlaca')}</h2><p class="np-sub" id="placa-sub"></p></div>
          <button class="btn-icon" data-close-modal aria-label="${t('fechar')}">${icone('x', 16)}</button>
        </div>
        <div class="modal-body">
          <div class="un-placa" id="placa-qr"></div>
          <p class="form-hint">${t('unPlacaDica')}</p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="placa-novo-codigo">${t('unNovoCodigo')}</button>
          <button class="btn-primary" id="placa-pdf">${icone('baixar', 16)}${t('unBaixarPlaca')}</button>
        </div>
      </div>
    </div>`
}

async function _carregar() {
  try {
    const [uSnap, eSnap] = await Promise.all([getDocs(consultaUnidades()), getDocs(consulta(collection(db, 'empresas')))])
    _unidades = uSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const minhas = new Set(empresasDoUsuario(sessao.usuario))
    _empresas = eSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(e => sessao.isDemo || sessao.usuario.perfil === 'supremo' || minhas.has(e.id))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
  } catch (e) {
    console.error(e)
    prxToast(t('erroCarregar'), 'error')
  }
  if (!document.getElementById('tbody-unidades')) return
  const nomeEmpresa = id => _empresas.find(e => e.id === id)?.nome || ''
  _unidades.sort((a, b) => nomeEmpresa(a.empresaId).localeCompare(nomeEmpresa(b.empresaId), 'pt-BR') || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
  const ativas = _unidades.filter(u => u.ativa !== false).length
  document.getElementById('un-resumo').textContent = _unidades.length
    ? tf('unResumo', { n: plural(_unidades.length, t('unUnidadeSing'), t('unUnidadePlur')), ativas: ativas })
    : t('unDesc')
  atualizarLateral({ contagens: { unidades: _unidades.length } })
  const tb = document.getElementById('tbody-unidades')
  if (!_unidades.length) {
    tb.innerHTML = linhaVazia(4, { titulo: t('unVazioTitulo'), texto: t('unVazioTexto'),
      acao: `<button type="button" class="btn-primary btn-sm" data-acao-vazio="nova">${t('unNova')}</button>` })
    return
  }
  tb.innerHTML = _unidades.map(u => `
    <tr data-id="${esc(u.id)}" tabindex="0" class="${u.ativa === false ? 'cfg-linha-inativa' : ''}">
      <td class="c-nome"><div class="un-nome">${esc(u.nome)}</div>${u.endereco ? `<div class="cfg-mudo">${esc(u.endereco)}</div>` : ''}</td>
      <td class="c-empresa" data-rotulo="${t('unColEmpresa')}">${esc(nomeEmpresa(u.empresaId))}</td>
      <td class="c-local" data-rotulo="${t('unColLocal')}">${typeof u.lat === 'number' ? `<span>${t('unComLocal')}</span>` : `<span class="cfg-mudo">${t('unSemLocalCurto')}</span>`}</td>
      <td class="c-acoes">
        <button class="btn-secondary btn-sm un-btn-placa" data-placa="${esc(u.id)}">${icone('qr', 16)}${t('unPlaca')}</button>
      </td>
    </tr>`).join('')
}

function _ligar() {
  initModal('modal-unidade')
  initModal('modal-placa')
  document.getElementById('btn-nova-unidade')?.addEventListener('click', () => _abrir(null))
  const tb = document.getElementById('tbody-unidades')
  tb.addEventListener('click', e => {
    if (e.target.closest('[data-acao-vazio]')) return _abrir(null)
    const placa = e.target.closest('[data-placa]')
    if (placa) { e.stopPropagation(); return _abrirPlaca(_unidades.find(u => u.id === placa.dataset.placa)) }
    const tr = e.target.closest('tr[data-id]')
    if (tr) _abrir(_unidades.find(u => u.id === tr.dataset.id))
  })
  tb.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) _abrir(_unidades.find(u => u.id === e.target.dataset.id)) })
  ligarInterruptor(document.getElementById('un-ativa-wrap'), on => {
    document.getElementById('un-ativa-label').textContent = on ? t('unAtiva') : t('unInativa')
  })
  document.getElementById('un-usar-local').addEventListener('click', _lerLocal)
  document.getElementById('un-salvar').addEventListener('click', _salvar)
  document.getElementById('un-nome').addEventListener('input', () => limparErro('un-nome'))
  document.getElementById('placa-pdf').addEventListener('click', _baixarPlaca)
  document.getElementById('placa-novo-codigo').addEventListener('click', _trocarCodigo)
}

function _abrir(u) {
  _editando = u
  _local = u && typeof u.lat === 'number' ? { lat: u.lat, lng: u.lng } : null
  limparErros(document.getElementById('modal-unidade'))
  document.getElementById('un-titulo').textContent = u ? t('unEditar') : t('unNova')
  document.getElementById('un-nome').value = u?.nome || ''
  document.getElementById('un-endereco').value = u?.endereco || ''
  const sel = document.getElementById('un-empresa')
  sel.innerHTML = (_empresas.length > 1 ? `<option value="">${t('selecionar')}</option>` : '') +
    _empresas.map(e => `<option value="${esc(e.id)}">${esc(e.nome)}</option>`).join('')
  sel.value = u?.empresaId || (_empresas.length === 1 ? _empresas[0].id : '')
  sel.disabled = !!u
  definirInterruptor(document.getElementById('un-ativa-wrap'), u ? u.ativa !== false : true)
  document.getElementById('un-ativa-label').textContent = (u ? u.ativa !== false : true) ? t('unAtiva') : t('unInativa')
  document.getElementById('un-ativa-grupo').hidden = !u
  _mostrarLocal()
  abrirModal('modal-unidade')
}

function _mostrarLocal() {
  const el = document.getElementById('un-local-txt')
  el.textContent = _local
    ? tf(_local.precisaoM ? 'unLocalLido' : 'unLocalGuardado', { lat: _local.lat.toFixed(5), lng: _local.lng.toFixed(5), m: Math.round(_local.precisaoM || 0) })
    : t('unLocalSem')
}

// A localização da unidade: lida no próprio lugar, pelo GPS do celular
function _lerLocal() {
  if (!navigator.geolocation) { prxToast(t('unSemGps'), 'warning'); return }
  const btn = document.getElementById('un-usar-local')
  btn.disabled = true
  navigator.geolocation.getCurrentPosition(p => {
    btn.disabled = false
    _local = { lat: p.coords.latitude, lng: p.coords.longitude, precisaoM: p.coords.accuracy }
    _mostrarLocal()
  }, () => {
    btn.disabled = false
    prxToast(t('unGpsNegado'), 'warning')
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
}

async function _salvar() {
  const modal = document.getElementById('modal-unidade')
  const nome = document.getElementById('un-nome').value.trim()
  const empresaId = document.getElementById('un-empresa').value
  const endereco = document.getElementById('un-endereco').value.trim()
  const ativa = _editando ? document.getElementById('un-ativa-wrap').getAttribute('aria-checked') === 'true' : true
  limparErros(modal)
  if (!nome) marcarErro('un-nome', t('nomeObrigatorio'))
  if (!empresaId) marcarErro('un-empresa', t('empresaObrigatoria'))
  if (modal.querySelector('[data-campo].invalido')) { focarPrimeiroErro(modal); return }
  const dados = {
    nome, empresaId, endereco, ativa,
    ...(_local ? { lat: _local.lat, lng: _local.lng } : {}),
    atualizadoEm: serverTimestamp(),
    ...(_editando ? {} : { criadoEm: serverTimestamp() }),
    ...(sessao.isDemo ? { isDemo: true } : {}),
  }
  mostrarSpinner()
  try {
    const id = await gravarAuditado({ colecao: 'unidades', id: _editando?.id || null, tipo: _editando ? 'editar' : 'criar',
      antes: _editando, nome, empresaIds: [empresaId], dados })
    // A unidade nova ganha o código da placa (no documento privado)
    if (!_editando) await setDoc(_refPlaca(id), { codigo: _codigoNovo(), ...(sessao.isDemo ? { isDemo: true } : {}) })
    prxToast(_editando ? t('unSalva') : tf('unCriada', { nome }), 'success')
    fecharModal('modal-unidade')
    await _carregar()
  } catch (e) {
    console.error(e)
    prxToast(t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}

let _placa = null
async function _abrirPlaca(u) {
  if (!u) return
  let codigo
  try { codigo = await _codigoDaPlaca(u) } catch (e) { console.error(e); prxToast(t('erroCarregar'), 'error'); return }
  _placa = { ...u, codigo }
  document.getElementById('placa-sub').textContent = u.nome
  document.getElementById('placa-qr').innerHTML = `${svgQR(enderecoDoQrDaUnidade(u, codigo), { tamanho: 220, rotulo: tf('unQrDe', { nome: u.nome }) })}
    <span class="un-placa-nome">${esc(u.nome)}</span>`
  abrirModal('modal-placa')
}

// Trocar o código invalida a placa impressa (perdida, copiada): a nova vale
async function _trocarCodigo() {
  const u = _placa
  if (!u) return
  mostrarSpinner()
  try {
    const codigo = _codigoNovo()
    await setDoc(_refPlaca(u.id), { codigo, ...(sessao.isDemo ? { isDemo: true } : {}) })
    // A troca fica na auditoria (a data; o código não sai do documento privado)
    const antes = _unidades.find(x => x.id === u.id) || u
    await gravarAuditado({ colecao: 'unidades', id: u.id, tipo: 'editar', antes, nome: u.nome, empresaIds: [u.empresaId],
      dados: { placaEm: serverTimestamp(), atualizadoEm: serverTimestamp() } })
    await _abrirPlaca(antes)
    prxToast(t('unCodigoTrocado'), 'success')
  } catch (e) {
    console.error(e)
    prxToast(t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}

// A placa em PDF (A5, para imprimir e colar): o QR grande, o nome da unidade e
// o que fazer. O QR é desenhado módulo a módulo (js/qr.js)
async function _baixarPlaca() {
  const u = _placa
  if (!u) return
  try {
    const { jsPDF } = await carregarBiblioteca('jspdf')
    const pdf = new jsPDF({ format: 'a5', unit: 'mm' })
    const { matriz } = matrizQR(enderecoDoQrDaUnidade(u, u.codigo))
    const n = matriz.length, lado = 100, m = lado / (n + 8), x0 = (148 - lado) / 2, y0 = 40
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22)
    pdf.text('PRAXIS', 74, 22, { align: 'center' })
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11)
    pdf.text(t('unPlacaPdfLinha'), 74, 31, { align: 'center' })
    pdf.setFillColor(0, 0, 0)
    matriz.forEach((linha, y) => linha.forEach((escuro, x) => { if (escuro) pdf.rect(x0 + (x + 4) * m, y0 + (y + 4) * m, m + 0.02, m + 0.02, 'F') }))
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18)
    pdf.text(u.nome, 74, y0 + lado + 14, { align: 'center', maxWidth: 128 })
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10)
    pdf.text(t('unPlacaPdfRodape'), 74, 195, { align: 'center', maxWidth: 128 })
    pdf.save(`${t('unPlacaArquivo')}-${u.nome.replace(/[^\w-]+/g, '-').toLowerCase()}.pdf`)
  } catch (e) {
    console.error(e)
    prxToast(t('erroExportarPDF'), 'error')
  }
}
