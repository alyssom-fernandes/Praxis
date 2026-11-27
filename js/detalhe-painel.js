// Detalhe do pedido: painel de decisão, pessoas, cotações, atividade,
// parcelas e os eventos da tela (ver js/pedido-detalhe.js).
import { navegar, registrarLimpador } from './app.js'
import { sessao } from './estado.js'
import { avisoNoFormulario, estadoVazio, abrirModal, fecharModal, empilharVoltar, desempilharVoltar } from './ui.js'
import { STATUS, STATUS_LABEL, PERFIS, PERFIS_LABEL, MOTIVO_OUTROS, rotuloMotivo, t } from './constants.js'
import {
  formatCurrency, formatDate, formatarDataRelativa, dataAbsoluta, dataComRelativo, gerarIniciais,
  parseMoeda, urlSegura, esc, dividirEmParcelas, impedimentoDeFuncao, empresasDoUsuario, dataEHora,
} from './utils.js'
import { agendarDuplicar } from './pedidos.js'
import { situacaoAprovacao, estaNoNivel } from './alcadas.js'
import { autocompletar } from './autocompletar.js'
import { prepararCampoNota } from './ler-nota.js'
import {
  _versoesAbertas, _opcoesFornecedor, _enviaArquivos, _svg, ICO, _TERMINAIS, _nomePorId, _quemFez,
  _diasAte, _cabModal, _ETAPAS, _dois, _textoVencimento, _pct, _entradas, _estadoPrazo,
  _revisarAutorizacao, _informarNota, _proximaParcela,
} from './pedido-detalhe.js'
import {
  _assumirPedido, _liberarClaim, _aprovarPedido, _reprovarPedido, _executarCompra,
  _confirmarEntrega, _confirmarPagamento, _cancelarPedido, _montarOverlay, _compararCotacoes,
  _rotuloCampo, _valorEdicao, _editarPedido, _fecharMentionDropdown, _handleMentionKeydown,
  _handleMentionInput, _enviarComentario, _podeApagarComentario, _redesenharAtividade,
  _focarComentario, _abrirEdicaoComentario, _fecharEdicaoComentario, _salvarComentario,
  _apagarComentario, _indicarCotacao, _pagarParcela, _anexarComprovante, _mostrarModalCotacao,
} from './detalhe-acoes.js'
import {
  _podeAssumir, _podeDecidir, _podeAnexarCotacao, _podeIndicarCotacao, _podePagarParcela,
  _avisoDeFuncao, _exportarPedidoPDF, _reabrirPedido, _textoNota, _tsMs, _uploadAnexo,
  _bindAnexosEvents,
} from './detalhe-dados.js'
import { D } from './detalhe-estado.js'
import { _registrarRetirada, _gerarAutorizacao } from './detalhe-requisicao.js'

// ── Painel de decisão: o que falta, quem responde e a ação ────
export function _renderDecisao(acoes) {
  const p = D.pedido
  const perfil = sessao.usuario.perfil
  const ind = D.cotacoes.find(c => c.indicada)
  const n = D.cotacoes.length
  const fatos = []     // [rótulo, valor, detalhe, classe]
  let rotulo = t('dtProximoPasso'), tom = 'neutro', titulo, texto, resp = null
  const ultimaNota = st => _textoNota([...D.historico].reverse().find(h => h.status === st && (h.nota || h.notaChave)) || {})
  const dinheiro = v => `<span class="dt-numeral">${formatCurrency(v)}</span>`
  const prazo = _estadoPrazo()
  const fatoPrazo = () => prazo && fatos.push([t('dtPrazo'), `<span class="dt-numeral">${prazo.data}</span>`, prazo.texto, prazo.cls ? `prazo-${prazo.cls}` : ''])
  const comprador = () => p.compradorId ? (_nomePorId(p.compradorId) || p.compradorNome || null) : (_quemFez(STATUS.AG_COTACAO)?.nome || null)

  switch (p.status) {
    case STATUS.SOLICITADO:
      titulo = _podeAssumir() ? t('dtSolicTituloPode') : t('dtSolicTitulo')
      texto = _podeAssumir() ? t('dtSolicTextoPode') : t('dtSolicTexto')
      if (p.valorEstimado) fatos.push([t('metaValorEst'), dinheiro(p.valorEstimado)])
      fatoPrazo()
      resp = { papel: t('compradorLabel'), nome: null, vazio: t('dtSemResponsavel') }
      break

    case STATUS.AG_COTACAO: {
      const pode = _podeAnexarCotacao()
      titulo = n === 0 ? (pode ? t('dtCotTituloVazio') : t('dtCotTituloAndamento'))
        : n < 3 ? t('dtCotRegistradasDe3', { n }) : (pode ? t('dtCotTituloIndicar') : t('dtCotRegistradas', { n }))
      texto = !pode ? t('dtCotTextoOutros')
        : n === 0 ? t('dtCotTextoVazio') : n < 3 ? t('dtCotTextoPoucas') : t('dtCotTextoIndicar')
      fatos.push([t('secaoCotacoes'), `<span class="dt-numeral">${n}</span><span class="dt-de"> ${t('dtDe3')}</span>`])
      if (n) fatos.push([t('dtMenorValor'), dinheiro(Math.min(...D.cotacoes.map(c => c.valor)))])
      else if (p.valorEstimado) fatos.push([t('metaValorEst'), dinheiro(p.valorEstimado)])
      fatoPrazo()
      resp = { papel: t('compradorLabel'), nome: comprador() || t('dtCompradorDesignado') }
      break
    }

    case STATUS.EM_APROVACAO: {
      const podeDecidir = _podeDecidir()
      titulo = podeDecidir ? t('dtAprovTituloPode') : t('dtAprovTitulo')
      texto = ind
        ? `${esc(ind.fornecedorNome)} ${t('dtFoiIndicada')}${n > 1 ? `, ${t('dtEntre')} ${n} ${t('dtCotacoesMin')}` : ''}.`
        : t('dtAprovSemIndicada')
      texto += ` ${_avisoDeFuncao('decidir', [PERFIS.APROVADOR, PERFIS.GESTOR, PERFIS.SUPREMO])}`
      if (ind) {
        fatos.push([t('dtPropostaIndicada'), dinheiro(ind.valor), esc(ind.fornecedorNome)])
        if (p.valorEstimado) {
          const dif = ind.valor - p.valorEstimado
          fatos.push([t('dtFrenteEstimado'), `<span class="dt-numeral">${_pct(dif / p.valorEstimado * 100)}</span>`,
            t(dif > 0 ? 'dtAcimaDe' : dif < 0 ? 'dtAbaixoDe' : 'dtIgualA', { valor: formatCurrency(p.valorEstimado) }), dif > 0 ? 'acima' : 'abaixo'])
        }
        if (n > 1) {
          const maior = Math.max(...D.cotacoes.map(c => c.valor))
          if (maior > ind.valor) fatos.push([t('economiaLabel'), dinheiro(maior - ind.valor), t('dtFrenteMaisCara')])
        }
      } else if (p.valorEstimado) fatos.push([t('metaValorEst'), dinheiro(p.valorEstimado)])
      // Alçada: o nível em que o pedido está e quantas aprovações faltam nele
      const alc = situacaoAprovacao(p)
      if (alc) {
        fatos.push([t('dtAlcada'), `<span class="dt-numeral">${t('dtAlcadaNumero', { nivel: alc.numero, total: alc.total })}</span>`,
          t(alc.faltam === 1 ? 'dtAlcadaFalta1' : 'dtAlcadaFaltam', { nome: esc(alc.nome), n: alc.faltam })])
      }
      resp = _respAprovadores()
      break
    }

    case STATUS.APROVADO: {
      const h = _quemFez(STATUS.APROVADO)
      const quem = _nomePorId(p.aprovadoPor) || p.aprovadoPorNome || h?.nome
      const em = p.aprovadoEm || h?.em
      // A requisição não passa pela compra: quem pediu busca no fornecedor
      const req = !!p.requisicao
      titulo = acoes.length ? t(req ? 'reqAprovadoTituloPode' : 'dtAprovadoTituloPode') : t(req ? 'reqAprovadoTitulo' : 'dtAprovadoTitulo')
      texto = `${quem ? `${t(em ? 'dtAprovadoPorEm' : 'dtAprovadoPor', { nome: esc(quem), d: em ? dataAbsoluta(em) : '' })} ` : ''}${req
        ? t(acoes.length ? 'reqAprovadoTextoPode' : 'reqAprovadoTexto')
        : acoes.length ? t('dtAprovadoTextoPode')
          : (_avisoDeFuncao('comprar', [PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO]) || t('dtAprovadoTexto'))}`
      if (req && p.fornecedorNome) fatos.push([t('npReqFornecedor'), esc(p.fornecedorNome)])
      if (ind) fatos.push([t('dtValorAprovado'), dinheiro(ind.valor), esc(ind.fornecedorNome)])
      else if (p.valorEstimado) fatos.push([t('metaValorEst'), dinheiro(p.valorEstimado)])
      fatoPrazo()
      resp = { papel: t('compradorLabel'), nome: comprador() || t('dtCompradorDesignado') }
      break
    }

    case STATUS.COMPRADO:
      titulo = acoes.length ? t('dtCompradoTituloPode') : t('dtCompradoTitulo')
      texto = `${p.fornecedorNome ? `${t(p.dataCompra ? 'dtCompraComEm' : 'dtCompraCom', { fornecedor: esc(p.fornecedorNome), d: p.dataCompra ? formatDate(p.dataCompra) : '' })} ` : ''}${t('dtCompradoTexto')}`
      if (p.valorFinal) fatos.push([t('metaValorFinal'), dinheiro(p.valorFinal), esc(p.fornecedorNome || '')])
      fatoPrazo()
      resp = { papel: t('dtRecebimento'), nome: comprador() || _nomePorId(p.solicitanteId) || p.solicitanteNome || null }
      break

    case STATUS.ENTREGUE: {
      const pagas = D.parcelas.filter(x => x.pago)
      const total = D.parcelas.reduce((s, x) => s + (x.valor || 0), 0)
      const pago = pagas.reduce((s, x) => s + (x.valor || 0), 0)
      const prox = _proximaParcela()
      titulo = prox
        ? (acoes.length ? t('dtRegistrePagamentoParcela', { parcela: `${prox.numero}/${prox.total}` }) : t('dtEntregueTitulo'))
        : (acoes.length ? t('dtEntregueTituloConcluir') : t('dtEntregueTitulo'))
      texto = `${p.dataEntrega ? `${t('dtRecebidoEm', { d: formatDate(p.dataEntrega) })} ` : ''}${D.parcelas.length
        ? t('dtParcelasPagas', { pagas: pagas.length, total: D.parcelas.length })
        : t('dtSemParcelas')} ${_avisoDeFuncao('pagar', [PERFIS.FINANCEIRO, PERFIS.GESTOR, PERFIS.SUPREMO])}`
      if (D.parcelas.length) fatos.push([t('dtPago'), dinheiro(pago), t('dtDeValor', { valor: formatCurrency(total) })])
      if (prox) {
        const d = _diasAte(prox.vencimento)
        const est = d === null ? '' : _textoVencimento(d)
        fatos.push([`${t('dtParcela')} ${prox.numero}/${prox.total}`, dinheiro(prox.valor), `${formatDate(prox.vencimento)}${est ? ` · ${est}` : ''}`, d !== null && d < 0 ? 'prazo-atrasado' : ''])
      }
      resp = _respFinanceiro()
      break
    }

    case STATUS.PAGO: {
      rotulo = t('dtConcluido'); tom = 'ok'
      const ent = _entradas()
      titulo = t('dtPagoTitulo')
      texto = p.valorFinal
        ? t(p.fornecedorNome ? 'dtPagosValorA' : 'dtPagosValor', { valor: formatCurrency(p.valorFinal), fornecedor: esc(p.fornecedorNome || '') })
        : t(p.fornecedorNome ? 'dtPagoIntegralA' : 'dtPagoIntegral', { fornecedor: esc(p.fornecedorNome || '') })
      if (p.valorFinal) fatos.push([t('dtValorPago'), dinheiro(p.valorFinal), esc(p.fornecedorNome || '')])
      if (ent[STATUS.PAGO]) fatos.push([t('dtConcluidoEm'), `<span class="dt-numeral">${dataAbsoluta(ent[STATUS.PAGO])}</span>`])
      if (p.criadoEm && ent[STATUS.PAGO]) {
        const d = Math.max(1, Math.round((_tsMs(ent[STATUS.PAGO]) - _tsMs(p.criadoEm)) / 86400000))
        fatos.push([t('dtDoPedidoAoPagamento'), `<span class="dt-numeral">${d}</span><span class="dt-de"> ${t(d === 1 ? 'dtDia' : 'dtDias')}</span>`])
      }
      break
    }

    case STATUS.REPROVADO: {
      rotulo = t('dtReprovado'); tom = 'erro'
      const motivo = p.motivoReprovacao === MOTIVO_OUTROS ? p.motivoReprovacaoOutros : (rotuloMotivo(p.motivoReprovacao) || ultimaNota(STATUS.REPROVADO))
      const h = _quemFez(STATUS.REPROVADO)
      const quem = _nomePorId(p.reprovadoPor) || p.reprovadoPorNome || h?.nome
      const em = p.reprovadoEm || h?.em
      titulo = motivo ? esc(motivo) : t('dtReprovadoTitulo')
      texto = quem ? t(em ? 'dtReprovadoPorEm' : 'dtReprovadoPor', { nome: esc(quem), d: em ? dataAbsoluta(em) : '' }) : ''
      if (p.reabertoPara) texto += ` ${t('dtJaReaberto')} ${esc(p.reabertaParaNum || '')}.`
      else if ([PERFIS.SOLICITANTE, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) texto += ` ${t('dtDicaReabrir')}`
      break
    }

    case STATUS.CANCELADO: {
      rotulo = t('dtCancelado'); tom = 'erro'
      const motivo = p.motivoCancelamento === MOTIVO_OUTROS ? p.motivoCancelamentoOutros : (rotuloMotivo(p.motivoCancelamento) || ultimaNota(STATUS.CANCELADO))
      const h = _quemFez(STATUS.CANCELADO)
      const quem = _nomePorId(p.canceladoPor) || p.canceladoPorNome || h?.nome
      const em = p.canceladoEm || h?.em
      titulo = motivo ? esc(motivo) : t('dtCanceladoTitulo')
      texto = `${quem ? `${t(em ? 'dtCanceladoPorEm' : 'dtCanceladoPor', { nome: esc(quem), d: em ? dataAbsoluta(em) : '' })} ` : ''}${t('dtCanceladoTexto')}`
      break
    }

    default: return ''
  }

  const comVoce = acoes.length > 0
  if (comVoce) tom = 'voce'
  // Vários responsáveis (os aprovadores): as iniciais de cada um, em pilha
  const avatarResp = !resp?.nome
    ? `<span class="avatar avatar-sm avatar-vazio" aria-hidden="true">${ICO.usuario}</span>`
    : resp.pessoas?.length > 1
      ? `<span class="avatar-pilha" aria-hidden="true">${resp.pessoas.map(u => `<span class="avatar avatar-sm">${gerarIniciais(u.nome)}</span>`).join('')}</span>`
      : `<span class="avatar avatar-sm" aria-hidden="true">${gerarIniciais(resp.pessoas?.[0]?.nome || resp.nome)}</span>`
  const respHtml = resp ? `
    <div class="decisao-fato decisao-resp">
      <dt>${t('dtResponsavel')}</dt>
      <dd>
        ${avatarResp}
        <span class="decisao-resp-txt">
          <span class="decisao-resp-nome">${resp.nome ? esc(resp.nome) : (resp.vazio || '—')}</span>
          <span class="decisao-resp-papel">${resp.papel}</span>
        </span>
      </dd>
    </div>` : ''

  return `
    <section class="decisao tom-${tom}" aria-labelledby="decisao-titulo">
      <div class="decisao-topo">
        <div class="decisao-texto">
          <p class="decisao-rotulo">${rotulo}${comVoce ? `<span class="decisao-voce">${t('dtComVoce')}</span>` : ''}</p>
          <h2 class="decisao-titulo" id="decisao-titulo">${titulo}</h2>
          ${texto.trim() ? `<p class="decisao-desc">${texto.trim()}</p>` : ''}
        </div>
        ${acoes.length ? `<div class="decisao-acoes" role="group" aria-label="${t('dtAcoesDoPasso')}">${acoes.join('')}</div>` : ''}
      </div>
      ${fatos.length || resp ? `
        <dl class="decisao-fatos">
          ${fatos.map(([k, v, sub, cls]) => `
            <div class="decisao-fato ${cls || ''}${String(v).replace(/<[^>]+>/g, '').trim().length >= 14 ? ' largo' : ''}">
              <dt>${k}</dt>
              <dd><span class="decisao-valor">${v}</span>${sub ? `<span class="decisao-sub">${sub}</span>` : ''}</dd>
            </div>`).join('')}
          ${respHtml}
        </dl>` : ''}
    </section>`
}

// Quem pode decidir este pedido: com alçada, quem está no nível atual (pelo
// perfil ou pelo nome); sem ela, os aprovadores da empresa. Menos quem abriu,
// cotou ou já votou (separação de funções)
export function _aprovadoresDoPedido() {
  const p = D.pedido
  const s = situacaoAprovacao(p)
  const daEmpresa = u => u.ativo !== false && (u.perfil === PERFIS.SUPREMO || empresasDoUsuario(u).includes(p.empresaId))
  return (s
    ? D.usuarios.filter(u => daEmpresa(u) && estaNoNivel(s.nivel, u))
    : p.aprovadorIds?.length
      ? p.aprovadorIds.map(id => D.usuarios.find(u => u.id === id)).filter(Boolean)
      : D.usuarios.filter(u => [PERFIS.APROVADOR, PERFIS.GESTOR].includes(u.perfil) && daEmpresa(u)))
    .filter(u => !impedimentoDeFuncao(p, u, 'decidir'))
}

// Quem pode decidir, quando não sobra ninguém na lista: a própria pessoa, se
// for aprovadora e não estiver impedida
export function _souAprovadorLivre() {
  return [PERFIS.APROVADOR, PERFIS.GESTOR].includes(sessao.usuario.perfil) &&
    !impedimentoDeFuncao(D.pedido, sessao.usuario, 'decidir')
}

// Quem decide a aprovação: os aprovadores do pedido ou da empresa
export function _respAprovadores() {
  const lista = _aprovadoresDoPedido()
  if (!lista.length) {
    const souAprov = _souAprovadorLivre()
    // Com alçada, o nome do nível ("Diretoria") no lugar de "aprovadores da empresa"
    return { papel: t('aprovadoresLabel'), nome: souAprov ? sessao.usuario.nome : null,
      vazio: situacaoAprovacao(D.pedido)?.nome || t('dtAprovadoresEmpresa') }
  }
  const nomes = lista.slice(0, 2).map(u => u.nome.split(' ')[0]).join(', ') + (lista.length > 2 ? ` ${t('dtEMais', { n: lista.length - 2 })}` : '')
  return { papel: t('aprovadoresLabel'), nome: nomes, pessoas: lista.slice(0, 2) }
}

export function _respFinanceiro() {
  const fins = D.usuarios.filter(u => u.perfil === PERFIS.FINANCEIRO && u.ativo !== false &&
    empresasDoUsuario(u).includes(D.pedido.empresaId))
  const nome = fins[0]?.nome || (sessao.usuario.perfil === PERFIS.FINANCEIRO ? sessao.usuario.nome : null)
  return { papel: PERFIS_LABEL[PERFIS.FINANCEIRO], nome, vazio: t('dtEquipeFinanceira') }
}

// ── Pessoas ───────────────────────────────────────────────────
// Rótulos usados quando o nome real não pode ser lido pelo perfil atual (no
// idioma da sessão, por isso a lista é montada na hora)
export const _nomeGenerico = nome => [t('dtAprovadoresEmpresa'), t('dtEquipeFinanceira'), t('dtCompradorDesignado'), PERFIS_LABEL[PERFIS.APROVADOR]].includes(nome)

export function _linhaPessoa(papel, nome, status, extra = '', statusCls = '') {
  const real = nome && !_nomeGenerico(nome)
  return `
    <div class="pessoa-linha">
      <div class="avatar avatar-sm ${real ? '' : 'avatar-vazio'}" aria-hidden="true">${real ? gerarIniciais(nome) : _svg('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>', 13)}</div>
      <div class="pessoa-corpo">
        <div class="pessoa-role">${papel}</div>
        <div class="pessoa-name">${nome ? esc(nome) : `<span class="pessoa-indef">${status || t('dtNaoDefinido')}</span>`}</div>
        ${status && nome ? `<div class="pessoa-status ${statusCls}">${status}</div>` : ''}
        ${extra}
      </div>
    </div>`
}

export function _renderPessoa(papel, nome, statusTxt) {
  return nome ? _linhaPessoa(papel, nome, statusTxt) : _linhaPessoa(papel, null, t('dtNomeIndisponivel'))
}

export function _renderPessoaComprador() {
  const p = D.pedido
  // Sem comprador gravado: vale quem assumiu no histórico, desde que o pedido tenha passado da
  // fila (um pedido devolvido à fila volta a "Aguardando comprador")
  const passouDaFila = [STATUS.AG_COTACAO, STATUS.EM_APROVACAO, STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO].includes(p.status) ||
    ([STATUS.REPROVADO, STATUS.CANCELADO].includes(p.status) && !!_quemFez(STATUS.AG_COTACAO))
  const nome = p.compradorId ? (_nomePorId(p.compradorId) || t('dtCompradorDesignado'))
    : (passouDaFila ? (_quemFez(STATUS.AG_COTACAO)?.nome || t('dtCompradorDesignado')) : null)
  if (!nome) return _linhaPessoa(t('compradorLabel'), null, _TERMINAIS.includes(p.status) ? t('dtNaoChegouCotacao') : t('aguardandoComprador'))
  const st = D.cotacoes.length
    ? (D.cotacoes.length === 1 ? t('dtCotRegistrada1') : t('dtCotRegistradas', { n: D.cotacoes.length }))
    : t('semCotacoes')
  return _linhaPessoa(t('compradorLabel'), nome, st)
}

export function _renderPessoaAprovadores() {
  const p = D.pedido
  const papel = t('aprovadoresLabel')
  const aprovou = [STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO].includes(p.status) || p.aprovadoPor
  if (aprovou) {
    const h = _quemFez(STATUS.APROVADO)
    const nome = _nomePorId(p.aprovadoPor) || h?.nome || PERFIS_LABEL[PERFIS.APROVADOR]
    const em = p.aprovadoEm || h?.em
    return _linhaPessoa(PERFIS_LABEL[PERFIS.APROVADOR], nome, `${ICO.check} ${em ? t('dtAprovadoEm', { d: dataAbsoluta(em) }) : t('aprovadoStatus')}`, '', 'text-green')
  }
  if (p.status === STATUS.REPROVADO || p.reprovadoPor) {
    const h = _quemFez(STATUS.REPROVADO)
    const nome = _nomePorId(p.reprovadoPor) || h?.nome || PERFIS_LABEL[PERFIS.APROVADOR]
    const em = p.reprovadoEm || h?.em
    return _linhaPessoa(PERFIS_LABEL[PERFIS.APROVADOR], nome, em ? t('dtReprovouEm', { d: dataAbsoluta(em) }) : t('dtReprovou'), '', 'text-red')
  }
  const lista = _aprovadoresDoPedido()
  const alc = p.status === STATUS.EM_APROVACAO ? situacaoAprovacao(p) : null
  const status = alc ? t('dtAlcadaPessoa', { nivel: alc.numero, total: alc.total, nome: esc(alc.nome) })
    : p.status === STATUS.EM_APROVACAO ? t('aguardandoStatus')
    : [STATUS.SOLICITADO, STATUS.AG_COTACAO].includes(p.status) ? t('dtEntraAposCotacoes')
    : p.status === STATUS.CANCELADO ? t('dtNaoChegouAprovacao') : ''
  if (!lista.length) {
    const souAprov = _souAprovadorLivre()
    return _linhaPessoa(papel, souAprov ? sessao.usuario.nome : t('dtAprovadoresEmpresa'), status)
  }
  const nomes = lista.slice(0, 2).map(u => u.nome.split(' ')[0]).join(', ') + (lista.length > 2 ? ` ${t('dtEMais', { n: lista.length - 2 })}` : '')
  return `
    <div class="pessoa-linha">
      <div class="avatar-pilha" aria-hidden="true">
        ${lista.slice(0, 2).map(u => `<div class="avatar avatar-sm">${gerarIniciais(u.nome)}</div>`).join('')}
      </div>
      <div class="pessoa-corpo">
        <div class="pessoa-role">${papel}</div>
        <div class="pessoa-name">${esc(nomes)}</div>
        ${status ? `<div class="pessoa-status">${status}</div>` : ''}
      </div>
    </div>`
}

export function _renderPessoaFinanceiro() {
  const fins = D.usuarios.filter(u => u.perfil === PERFIS.FINANCEIRO && u.ativo !== false &&
    empresasDoUsuario(u).includes(D.pedido.empresaId))
  const nome = fins[0]?.nome || (sessao.usuario.perfil === PERFIS.FINANCEIRO ? sessao.usuario.nome : null)
  const totalPago = D.parcelas.filter(p => p.pago).length
  const totalParc = D.parcelas.length
  const st = totalParc ? t('dtPagasDe', { pagas: totalPago, total: totalParc }) : t('dtSemParcelasCurto')
  return _linhaPessoa(PERFIS_LABEL[PERFIS.FINANCEIRO], nome || t('dtEquipeFinanceira'), st)
}

// ── Cotações ──────────────────────────────────────────────────
// A lista já é a comparação: em ordem de valor, com a indicada e a de menor valor
// marcadas, a diferença de cada proposta para a indicada (ou para a menor, antes
// da indicação) e um fio proporcional ao valor.
export function _renderCotacoes() {
  if (!D.cotacoes.length) {
    const pode = _podeAnexarCotacao()
    const sub = pode
      ? t('dtCotVazioPode')
      : D.pedido.status === STATUS.SOLICITADO
        ? t('dtCotVazioSolic')
        : t('dtCotVazioOutros')
    return estadoVazio({ variante: 'compacto', titulo: t('dtCotVazioTitulo'), texto: sub })
  }
  const comValor = D.cotacoes.filter(c => !c.semProduto)
  const valores = comValor.map(c => c.valor || 0)
  const menor = valores.length ? Math.min(...valores) : 0
  const maior = valores.length ? Math.max(...valores) : 0
  const ind = D.cotacoes.find(c => c.indicada)
  const ref = ind || comValor.find(c => (c.valor || 0) === menor)
  const podeIndicar = _podeIndicarCotacao()
  const varias = comValor.length > 1
  const ordenadas = [...comValor.sort((a, b) => (a.valor - b.valor) || (b.indicada - a.indicada)), ...D.cotacoes.filter(c => c.semProduto)]

  const linhas = ordenadas.map(c => {
    const anuncio = c.link && urlSegura(c.link)
      ? `<a href="${esc(urlSegura(c.link))}" target="_blank" rel="noopener" class="btn-icon" aria-label="${t('dtVerAnuncio')}" title="${t('dtVerAnuncio')}">${ICO.externo}</a>` : ''
    if (c.semProduto) {
      return `
      <li class="cotacao-item sem-produto">
        <div class="cotacao-info">
          <div class="cotacao-fornecedor">${esc(c.fornecedorNome)}<span class="cotacao-marcas"><span class="cot-marca cot-sem-produto">${t('dtSemProduto')}</span></span></div>
          ${c.condicoesComerciais ? `<div class="cotacao-sub">${esc(c.condicoesComerciais)}</div>` : ''}
        </div>
        <div class="cotacao-lado"><span class="cotacao-valor cotacao-sem-valor">—</span></div>
        ${anuncio ? `<div class="cotacao-acoes">${anuncio}</div>` : ''}
      </li>`
    }
    const eRef = c === ref
    const dif = (c.valor || 0) - (ref.valor || 0)
    let difHtml = ''
    if (varias && !eRef) {
      const pct = ref.valor ? dif / ref.valor * 100 : 0
      const maisBarata = ind && dif < 0
      difHtml = `<span class="cotacao-dif${maisBarata ? ' mais-barata' : ''}"${maisBarata ? ` title="${t('dtMaisBarataQueIndicada')}"` : ''}>${dif > 0 ? '+' : dif < 0 ? '−' : ''}${formatCurrency(Math.abs(dif))}<span class="cotacao-dif-pct">${_pct(pct)}</span></span>`
    } else if (varias && eRef) {
      difHtml = `<span class="cotacao-dif cotacao-dif-base">${t('dtBaseComparacao')}</span>`
    }
    const marcas = [
      c.indicada ? `<span class="cot-marca cot-indicada">${t('dtIndicada')}</span>` : '',
      varias && (c.valor || 0) === menor ? `<span class="cot-marca cot-menor">${t('dtMenorValor')}</span>` : '',
    ].join('')
    const largura = maior ? Math.max((c.valor || 0) / maior * 100, 3) : 0
    const acoes = [
      anuncio,
      c.arquivoUrl ? `<a href="${esc(urlSegura(c.arquivoUrl))}" target="_blank" rel="noopener" class="btn-icon" aria-label="${t('dtAbrirArquivoCotacao')}" title="${t('dtAbrirArquivo')}">${ICO.externo}</a>` : '',
      podeIndicar && !c.indicada ? `<button class="btn-ghost btn-sm" data-indicar="${esc(c.id)}" title="${t('dtIndicarTitulo')}">${t('dtIndicar')}</button>` : '',
    ].join('')
    return `
      <li class="cotacao-item${c.indicada ? ' indicada' : ''}">
        <div class="cotacao-info">
          <div class="cotacao-fornecedor">${esc(c.fornecedorNome)}${marcas ? `<span class="cotacao-marcas">${marcas}</span>` : ''}</div>
          <div class="cotacao-sub">${esc([c.prazoEntrega ? t('dtPrazoEntregaCurto', { prazo: c.prazoEntrega }) : '', c.condicoesComerciais].filter(Boolean).join(' · ') || t('dtSemCondicoes'))}</div>
        </div>
        <div class="cotacao-lado">
          <span class="cotacao-valor">${formatCurrency(c.valor)}</span>
          ${difHtml}
        </div>
        ${acoes ? `<div class="cotacao-acoes">${acoes}</div>` : ''}
        ${varias ? `<span class="cotacao-fio" aria-hidden="true"><span data-estilo="width:${largura.toFixed(1)}%"></span></span>` : ''}
      </li>`
  }).join('')

  const economia = ind && varias && maior > ind.valor
    ? `<p class="cotacoes-economia">${t('dtEconomiaFrase1')} <span class="dt-numeral">${formatCurrency(maior - ind.valor)}</span> ${t('dtEconomiaFrase2')}</p>`
    : ''
  const m = D.pedido.motivoCotacaoUnica
  const unica = m ? `<p class="cotacoes-unica">${esc(t('dtCotacaoUnica', { motivo: _rotuloCotacaoUnica(m) }))}</p>` : ''
  return `<ol class="cotacoes-lista">${linhas}</ol>${economia}${unica}`
}

// Motivo de uma cotação só: uma das opções (cotUnica_*) ou o texto digitado
export const _MOTIVOS_COT_UNICA = ['habitual', 'exclusivo', 'urgencia', 'negociado']
export const _rotuloCotacaoUnica = m => _MOTIVOS_COT_UNICA.includes(m) ? t(`cotUnica_${m}`) : m

// Pergunta por que há uma cotação só; resolve com o motivo ou null
export function _perguntarCotacaoUnica(c) {
  return new Promise(resolve => {
    let resolvido = false
    const fim = v => { if (!resolvido) { resolvido = true; resolve(v) } }
    const { overlay, fechar } = _montarOverlay('modal-cot-unica', `
      <div class="modal" data-estilo="max-width:480px" role="dialog" aria-modal="true" aria-labelledby="cot-unica-titulo">
        ${_cabModal('cot-unica-titulo', t('cotUnicaTitulo'), 'data-fechar')}
        <div class="modal-body">
          <p class="modal-intro">${c ? `${esc(c.fornecedorNome)}, ${formatCurrency(c.valor)}. ` : ''}${t('cotUnicaTexto')}</p>
          <div class="category-chips" id="cot-unica-opcoes" role="radiogroup" aria-labelledby="cot-unica-titulo">
            ${[..._MOTIVOS_COT_UNICA, 'outro'].map(m => `<button type="button" class="chip" role="radio" aria-checked="false" data-motivo="${m}">${t(`cotUnica_${m}`)}</button>`).join('')}
          </div>
          <div class="form-group" id="cot-unica-outro-wrap" hidden>
            <label for="cot-unica-outro">${t('cotUnicaOutro')}</label>
            <textarea id="cot-unica-outro" rows="2" maxlength="300"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-fechar>${t('btnCancelar')}</button>
          <button class="btn-primary" id="cot-unica-ok">${t('dtIndicarConfirmaOk')}</button>
        </div>
      </div>`)
    const grupo = overlay.querySelector('#cot-unica-opcoes')
    grupo.addEventListener('click', e => {
      const chip = e.target.closest('.chip')
      if (!chip) return
      grupo.querySelectorAll('.chip').forEach(x => { x.classList.toggle('selected', x === chip); x.setAttribute('aria-checked', String(x === chip)) })
      const outro = chip.dataset.motivo === 'outro'
      overlay.querySelector('#cot-unica-outro-wrap').hidden = !outro
      if (outro) overlay.querySelector('#cot-unica-outro').focus()
    })
    overlay.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => fim(null)))
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) fim(null) })
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') fim(null) })
    overlay.querySelector('#cot-unica-ok').addEventListener('click', () => {
      const escolha = grupo.querySelector('.chip.selected')?.dataset.motivo
      const texto = overlay.querySelector('#cot-unica-outro').value.trim()
      const motivo = escolha === 'outro' ? texto : escolha
      if (!motivo) { avisoNoFormulario(overlay, t('erroCamposObrigatorios')); return }
      fechar()
      fim(motivo.slice(0, 300))
    })
  })
}

// ── Atividade ─────────────────────────────────────────────────
// Mais recente primeiro (o campo de comentário fica no topo). Mudanças de etapa
// levam o numeral da etapa, como na régua do caminho.
export function _renderActivityFeed() {
  const hist = D.historico.map(h  => ({ ...h,  _feedTipo: h.tipo || 'status' }))
  const comt = D.comentarios.map(c => ({ ...c, _feedTipo: 'comentario' }))
  const l = D.pedido.lancamento
  const lanc = l ? [{ _feedTipo: 'lancamento', criadoEm: D.pedido.criadoEm, autorId: l.lancadoPor, autorNome: l.lancadoPorNome }] : []
  const feed = [...hist, ...comt, ...lanc].sort((a, b) => _tsMs(b.criadoEm) - _tsMs(a.criadoEm))

  if (!feed.length) return estadoVazio({ variante: 'compacto', tag: 'li', titulo: t('dtAtividadeVazia'), texto: t('dtAtividadeVaziaTexto') })

  const evento = (marca, html, ts, cls = '') => `
    <li class="feed-item ${cls}">
      <div class="feed-left">${marca}</div>
      <div class="feed-body">
        <div class="feed-text">${html}</div>
        <div class="feed-time" title="${ts.title}">${ts.texto}</div>
      </div>
    </li>`
  const icone = d => `<span class="feed-marca">${_svg(d, 12)}</span>`

  return feed.map(item => {
    const nome = item.autorNome || _nomePorId(item.autorId)
    const ts   = dataComRelativo(item.criadoEm)
    const quem = nome ? `<strong>${esc(nome)}</strong>` : ''

    if (item._feedTipo === 'status') {
      const i = _ETAPAS.indexOf(item.status)
      const negativo = [STATUS.REPROVADO, STATUS.CANCELADO].includes(item.status)
      const marca = negativo
        ? `<span class="feed-marca feed-marca-neg">${_svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 12)}</span>`
        : `<span class="feed-marca feed-marca-num">${i >= 0 ? _dois(i + 1) : '·'}</span>`
      const st = `<span class="feed-status">${STATUS_LABEL[item.status] || esc(item.status)}</span>`
      const nota = _textoNota(item)
      const reprovou = item.status === STATUS.REPROVADO
      const frase = item.status === STATUS.SOLICITADO && !nota
        ? (quem ? t('feedAbriu', { quem }) : t('feedPedidoAberto'))
        : negativo
          ? (quem ? t(reprovou ? 'feedReprovou' : 'feedCancelou', { quem }) : t(reprovou ? 'feedPedidoReprovado' : 'feedPedidoCancelado'))
          : (quem ? t('feedMoveu', { quem, etapa: st }) : t('feedMovido', { etapa: st }))
      return evento(marca, `${frase}${nota ? `<div class="feed-nota">${esc(nota)}</div>` : ''}`, ts, negativo ? 'feed-item-neg' : 'feed-item-etapa')
    }

    if (item._feedTipo === 'comentario') {
      const texto = esc(item.texto || '').replace(/@([\wÀ-ÿ]+)/g, '<span class="mention">@$1</span>')
      const salvo = !String(item.id).startsWith('temp-')
      const meu = salvo && item.autorId === sessao.usuario.id
      const apaga = salvo && _podeApagarComentario()
      const editando = D.comentEditando?.id === item.id
      const id = esc(item.id)
      const acao = (tipo, rotulo, cls = '') =>
        `<button type="button" class="coment-acao ${cls}" data-coment-acao="${tipo}" data-coment-id="${id}" aria-label="${rotulo}">${t(tipo === 'editar' ? 'comentEditar' : 'comentApagar')}</button>`
      const versoes = item.versoes || []
      const verAberto = _versoesAbertas.has(item.id) && versoes.length > 0
      const editado = !item.editadoEm ? ''
        : versoes.length
          ? `<button type="button" class="feed-editado" data-coment-acao="versoes" data-coment-id="${id}" aria-expanded="${verAberto}" aria-label="${t('comentVersoesAria')}" title="${formatarDataRelativa(item.editadoEm).title}">${t('comentEditado')}</button>`
          : `<span class="feed-editado" title="${formatarDataRelativa(item.editadoEm).title}">${t('comentEditado')}</span>`
      const interna = item.interno ? `<span class="lozenge lozenge-aguardando feed-interna" title="${t('notaInternaDica')}">${t('notaInternaSelo')}</span>` : ''
      const anteriores = verAberto ? `
            <ol class="coment-versoes" aria-label="${t('comentVersoesAria')}">${[...versoes].reverse().map(v => `
              <li><span class="coment-versao-data">${v.em ? dataEHora(v.em) : ''}</span><span class="coment-versao-texto">${esc(v.texto || '')}</span></li>`).join('')}
            </ol>` : ''
      const corpo = editando ? `
            <div class="coment-edicao">
              <label class="sr-only" for="coment-edit-${id}">${t('comentEditarAria')}</label>
              <textarea id="coment-edit-${id}" rows="3" data-coment-rascunho="${id}">${esc(D.comentEditando.rascunho)}</textarea>
              <div class="coment-edicao-acoes">
                <button type="button" class="btn-ghost btn-sm" data-coment-acao="cancelar" data-coment-id="${id}">${t('btnCancelar')}</button>
                <button type="button" class="btn-secondary btn-sm" data-coment-acao="salvar" data-coment-id="${id}">${t('salvar')}</button>
              </div>
            </div>`
        : `<div class="comentario-bolha"><div class="comment-text">${texto}</div></div>`
      return `
        <li class="feed-item feed-item-comment${item.interno ? ' feed-item-interna' : ''}">
          <div class="feed-left"><div class="avatar avatar-sm ${nome ? '' : 'avatar-vazio'}" aria-hidden="true">${nome ? gerarIniciais(nome) : _svg('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>', 12)}</div></div>
          <div class="feed-body">
            <div class="feed-header">
              <span class="feed-author">${esc(nome || t('feedParticipante'))}</span>
              ${interna}
              <span class="feed-time" title="${ts.title}">${ts.texto}</span>
              ${editado}
              ${(meu || apaga) && !editando ? `<span class="coment-acoes">
                ${meu ? acao('editar', t('comentEditarAria')) : ''}
                ${apaga ? acao('apagar', t('comentApagarAria'), 'coment-acao-perigo') : ''}
              </span>` : ''}
            </div>
            ${corpo}
            ${anteriores}
          </div>
        </li>`
    }

    if (item._feedTipo === 'cotacao') {
      return evento(icone('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
        `${t('feedCotacao', { quem: quem || t('feedAlguem'), fornecedor: `<strong>${esc(item.fornecedorNome || '—')}</strong>` })}${item.semProduto ? ` <span class="feed-sem-produto">(${t('dtSemProduto')})</span>` : item.valor ? ` <span class="num">(${formatCurrency(item.valor)})</span>` : ''}`, ts)
    }

    if (item._feedTipo === 'lancamento') {
      return evento(icone('<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/>'),
        t('feedLancou', { quem: quem || t('feedAlguem') }), ts, 'feed-item-etapa')
    }

    if (item._feedTipo === 'autorizacao') {
      const negou = item.resultado === 'negada'
      return evento(icone(negou ? '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' : '<polyline points="20 6 9 17 4 12"/>'),
        t(negou ? 'feedAutorizacaoNegada' : 'feedAutorizacaoConfirmada', { quem: quem || t('feedAlguem') }), ts, negou ? 'feed-item-neg' : '')
    }

    if (item._feedTipo === 'comprovante') {
      return evento(icone('<polyline points="20 6 9 17 4 12"/>'),
        t('feedComprovante', { quem: quem || t('feedAlguem'), parcela: `<strong class="num">${esc(item.parcelaNumero || '')}</strong>` }), ts)
    }

    if (item._feedTipo === 'edicao') {
      return evento(icone('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>'),
        `${t('feedAlterou', { quem: quem || t('feedAlguem'), campo: `<strong>${esc(_rotuloCampo(item))}</strong>` })}
         <div class="feed-nota"><span class="feed-antes">${esc(_valorEdicao(item, item.valorAnterior))}</span> → ${esc(_valorEdicao(item, item.valorNovo))}</div>`, ts)
    }

    // Voto num nível da alçada (o último voto vira a entrada "Aprovado")
    if (item._feedTipo === 'voto') {
      return evento(icone('<polyline points="20 6 9 17 4 12"/>'),
        `${t('feedVotou', { quem: quem || t('feedAlguem'), nivel: item.nivel, total: item.nivelTotal, nome: `<strong>${esc(item.nivelNome || '')}</strong>` })}${item.avancou
          ? `<div class="feed-nota">${t('feedVotoAvancou', { nivel: item.nivel + 1 })}</div>` : ''}`, ts)
    }

    if (item._feedTipo === 'anexo') {
      return evento(icone('<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>'),
        t('feedAnexou', { quem: quem || t('feedAlguem'), arquivo: `<strong>${esc(item.nomeArquivo || '—')}</strong>` }), ts)
    }

    return ''
  }).join('')
}

// ── Parcelas ──────────────────────────────────────────────────
export function _renderParcelasBloco() {
  const total = D.parcelas.reduce((s, x) => s + (x.valor || 0), 0)
  const pago  = D.parcelas.filter(x => x.pago).reduce((s, x) => s + (x.valor || 0), 0)
  const pct   = total ? Math.round(pago / total * 100) : 0
  const pagas = D.parcelas.filter(x => x.pago).length
  return `
    <div class="parcelas-resumo">
      <div class="parcelas-resumo-txt">
        <span class="parcelas-pago">${formatCurrency(pago)}</span>
        <span class="parcelas-de">${t('dtPagosDe')} ${formatCurrency(total)} · ${t(D.parcelas.length === 1 ? 'dtParcelasDe1' : 'dtParcelasDe', { pagas, total: D.parcelas.length })}</span>
      </div>
      <span class="parcelas-pct">${pct}%</span>
    </div>
    <div class="parcelas-barra" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${t('dtPercentualPago')}"><span data-estilo="width:${pct}%"></span></div>
    <ol class="parcelas-lista" id="parcelas-list" data-estilo="--col-acoes:${_podePagarParcela() ? '112px' : (D.parcelas.some(x => x.comprovante) ? '36px' : '0px')}">${_renderParcelas()}</ol>
    ${_podePagarParcela() && !_enviaArquivos() ? `<p class="form-hint">${t('dtArquivosDesligados')}</p>` : ''}`
}

export function _renderParcelas() {
  const podePagar = _podePagarParcela()
  return D.parcelas.map(parc => {
    let estado, cls = ''
    if (parc.pago) {
      estado = parc.pagoEm ? t('parcPagaEm', { d: dataAbsoluta(parc.pagoEm) }) : t('parcPaga')
      cls = 'paga'
    } else {
      const d = _diasAte(parc.vencimento)
      if (d === null) estado = t('parcSemVencimento')
      else {
        estado = _textoVencimento(d)
        cls = d < 0 ? 'vencida' : d <= 3 ? 'vencendo' : ''
      }
    }
    const acoes = [
      parc.comprovante ? `<a href="${esc(urlSegura(parc.comprovante))}" target="_blank" rel="noopener" class="btn-icon" aria-label="${t('dtVerComprovante')}" title="${t('dtVerComprovante')}">${ICO.doc}</a>` : '',
      podePagar && !parc.comprovante && _enviaArquivos() ? `
        <label class="btn-icon" tabindex="0" aria-label="${t('dtAnexarComprovante')}" title="${t('dtAnexarComprovante')}">
          ${ICO.clipe}
          <input type="file" accept="image/*,.pdf" data-comprov="${esc(parc.id)}" class="sr-only" tabindex="-1">
        </label>` : '',
      !parc.pago && podePagar ? `<button class="btn-ghost btn-sm" data-pagar="${esc(parc.id)}" title="${t('dtRegistrarPagamento')}">${t('dtPagar')}</button>` : '',
    ].join('')
    return `
      <li class="parcela-item ${cls}">
        <div class="parcela-numero"><b>${esc(parc.numero)}</b><span>/${esc(parc.total)}</span></div>
        <div class="parcela-info">
          <div class="parcela-data">${formatDate(parc.vencimento)}</div>
          <div class="parcela-venc ${cls}">${estado}</div>
        </div>
        <div class="parcela-valor${parc.pago ? ' parcela-pago' : ''}">${formatCurrency(parc.valor)}</div>
        <div class="parcela-acoes">${acoes}</div>
      </li>`
  }).join('')
}

// ── Bind de eventos ───────────────────────────────────────────

export function _bindMenuAcoes() {
  const btn  = document.getElementById('btn-mais-acoes')
  const menu = document.getElementById('menu-mais-acoes')
  if (D.fecharMenuDoc) { document.removeEventListener('click', D.fecharMenuDoc); document.removeEventListener('keydown', D.fecharMenuDoc) }
  if (!btn || !menu) return
  // Celular: o voltar do Android fecha o menu, sem sair do pedido
  const fechar = () => {
    menu.hidden = true; btn.setAttribute('aria-expanded', 'false')
    if (menu._voltar) { desempilharVoltar(menu._voltar); menu._voltar = null }
  }
  btn.addEventListener('click', e => {
    e.stopPropagation()
    const abrir = menu.hidden
    if (!abrir) { fechar(); return }
    menu.hidden = false
    btn.setAttribute('aria-expanded', 'true')
    if (!menu._voltar) menu._voltar = empilharVoltar(() => { menu._voltar = null; fechar() }, 'menu-mais-acoes')
    if (abrir) [...menu.querySelectorAll('.menu-acoes-item')].find(i => i.offsetParent !== null)?.focus()
  })
  menu.addEventListener('click', e => { if (e.target.closest('.menu-acoes-item')) fechar() })
  menu.addEventListener('keydown', e => {
    const itens = [...menu.querySelectorAll('.menu-acoes-item')].filter(i => i.offsetParent !== null)
    const idx = itens.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); itens[(idx + 1) % itens.length]?.focus() }
    if (e.key === 'ArrowUp')   { e.preventDefault(); itens[(idx - 1 + itens.length) % itens.length]?.focus() }
  })
  D.fecharMenuDoc = e => {
    if (e.type === 'keydown' && e.key !== 'Escape') return
    if (e.type === 'click' && e.target.closest?.('.menu-acoes-wrap')) return
    if (!menu.hidden) { fechar(); if (e.type === 'keydown') btn.focus() }
  }
  document.addEventListener('click', D.fecharMenuDoc)
  document.addEventListener('keydown', D.fecharMenuDoc)
  if (!D.menuLimpadorReg) {
    D.menuLimpadorReg = true
    registrarLimpador(() => {
      D.menuLimpadorReg = false
      if (D.fecharMenuDoc) { document.removeEventListener('click', D.fecharMenuDoc); document.removeEventListener('keydown', D.fecharMenuDoc); D.fecharMenuDoc = null }
    })
  }
}

export function _bindParcelasEvents(raiz = document) {
  raiz.querySelectorAll('[data-pagar]').forEach(btn => {
    btn.addEventListener('click', () => _pagarParcela(btn.dataset.pagar))
  })
  raiz.querySelectorAll('input[data-comprov]').forEach(inp => {
    inp.addEventListener('change', e => {
      const file = e.target.files[0]
      if (file) _anexarComprovante(inp.dataset.comprov, file)
    })
  })
}

export function _atualizarResumoParcelasCompra() {
  const el = document.getElementById('mc-resumo-parcelas')
  if (!el) return
  const valor = parseMoeda(document.getElementById('mc-valor')?.value || '')
  const n = parseInt(document.getElementById('mc-parcelas')?.value) || 1
  if (!(valor > 0)) { el.textContent = ''; return }
  if (n <= 1) { el.textContent = t('mcPagamentoUnico', { valor: formatCurrency(valor) }); return }
  // Os mesmos valores que serão gravados: a última parcela leva a diferença dos centavos
  const parcelas = dividirEmParcelas(valor, n)
  const primeira = parcelas[0]
  const ultima = parcelas[parcelas.length - 1]
  el.textContent = ultima === primeira
    ? t('mcParcelasIguais', { n, valor: formatCurrency(primeira) })
    : t('mcParcelasUltima', { n, valor: formatCurrency(primeira), ultima: formatCurrency(ultima) })
}

export function _bindDetalheEvents() {
  // Fecha modais: botões, clique fora e Esc
  document.querySelectorAll('#detalhe-root [data-close]').forEach(btn => {
    btn.addEventListener('click', () => fecharModal(btn.dataset.close))
  })
  document.querySelectorAll('#detalhe-root .modal-overlay').forEach(ov => {
    ov.addEventListener('mousedown', e => { if (e.target === ov) fecharModal(ov.id) })
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(ov.id) })
  })

  _bindMenuAcoes()

  document.getElementById('btn-assumir')?.addEventListener('click', _assumirPedido)
  document.getElementById('btn-liberar')?.addEventListener('click', _liberarClaim)
  document.getElementById('btn-aprovar')?.addEventListener('click', _aprovarPedido)
  document.getElementById('btn-reprovar')?.addEventListener('click', () => abrirModal('modal-reprovar'))

  document.getElementById('reprov-motivo')?.addEventListener('change', e => {
    const wrap = document.getElementById('reprov-outros-wrap')
    if (wrap) wrap.style.display = e.target.value === MOTIVO_OUTROS ? 'block' : 'none'
  })
  document.getElementById('btn-confirmar-reprovar')?.addEventListener('click', _reprovarPedido)

  document.getElementById('btn-feed-mais')?.addEventListener('click', e => {
    D.secoesAlternadas.atividade = true
    document.getElementById('activity-feed')?.classList.remove('curta')
    e.currentTarget.remove()
  })
  document.querySelectorAll('#detalhe-root .dt-recolher').forEach(b => b.addEventListener('click', () => {
    const secao = b.closest('.dt-bloco')
    const abrir = secao.classList.contains('recolhida')
    secao.classList.toggle('recolhida', !abrir)
    secao.classList.toggle('abrindo', abrir)
    if (abrir) setTimeout(() => secao.classList.remove('abrindo'), 260)
    b.setAttribute('aria-expanded', String(abrir))
    D.secoesAlternadas[b.dataset.secao] = abrir
  }))
  document.getElementById('btn-executar-compra')?.addEventListener('click', () => {
    abrirModal('modal-compra')
    _atualizarResumoParcelasCompra()
  })
  autocompletar(document.getElementById('mc-fornecedor'), _opcoesFornecedor)
  prepararCampoNota(document.getElementById('mc-nota'))
  ;['mc-valor', 'mc-parcelas'].forEach(id => document.getElementById(id)?.addEventListener('input', _atualizarResumoParcelasCompra))
  document.getElementById('btn-confirmar-compra')?.addEventListener('click', _executarCompra)
  // S5: "já pago" só depois de "já chegou"
  document.getElementById('mc-chegou')?.addEventListener('change', e => {
    const pago = document.getElementById('mc-pago')
    if (pago) { pago.disabled = !e.target.checked; if (!e.target.checked) pago.checked = false }
  })

  document.getElementById('btn-confirmar-entrega')?.addEventListener('click', _confirmarEntrega)
  document.getElementById('btn-lanc-confirmar')?.addEventListener('click', () => _revisarAutorizacao('confirmada'))
  document.getElementById('btn-lanc-negar')?.addEventListener('click', () => _revisarAutorizacao('negada'))
  document.getElementById('btn-informar-nota')?.addEventListener('click', _informarNota)
  document.getElementById('btn-confirmar-pagamento')?.addEventListener('click', _confirmarPagamento)
  document.getElementById('btn-pagar-fatura')?.addEventListener('click', async () => {
    const { abrirFatura } = await import('./fatura.js')
    abrirFatura(D.pedido)
  })

  document.getElementById('btn-cancelar')?.addEventListener('click', () => abrirModal('modal-cancelar'))
  document.getElementById('cancel-motivo')?.addEventListener('change', e => {
    const wrap = document.getElementById('cancel-outros-wrap')
    if (wrap) wrap.style.display = e.target.value === MOTIVO_OUTROS ? 'block' : 'none'
  })
  document.getElementById('btn-confirmar-cancelar')?.addEventListener('click', _cancelarPedido)

  // Comentário
  document.getElementById('btn-enviar-comentario')?.addEventListener('click', _enviarComentario)
  document.getElementById('input-comentario')?.addEventListener('keydown', e => {
    if (_handleMentionKeydown(e)) return
    if (e.key === 'Escape') { _fecharMentionDropdown(); return }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { _fecharMentionDropdown(); _enviarComentario() }
  })
  document.getElementById('input-comentario')?.addEventListener('input', _handleMentionInput)
  document.getElementById('coment-interno')?.addEventListener('change', e => {
    D.notaInterna = e.target.checked
    e.target.closest('.comentario-campo')?.classList.toggle('interno', D.notaInterna)
  })
  document.getElementById('input-comentario')?.addEventListener('blur', () => setTimeout(_fecharMentionDropdown, 150))

  // Comentário já enviado: o autor edita; o gestor da empresa e o supremo apagam
  const feed = document.getElementById('activity-feed')
  feed?.addEventListener('click', e => {
    const b = e.target.closest('[data-coment-acao]')
    if (!b) return
    const id = b.dataset.comentId
    if (b.dataset.comentAcao === 'editar') _abrirEdicaoComentario(id)
    else if (b.dataset.comentAcao === 'apagar') _apagarComentario(id)
    else if (b.dataset.comentAcao === 'salvar') _salvarComentario(id)
    else if (b.dataset.comentAcao === 'cancelar') _fecharEdicaoComentario(id)
    else if (b.dataset.comentAcao === 'versoes') {
      if (_versoesAbertas.has(id)) _versoesAbertas.delete(id); else _versoesAbertas.add(id)
      _redesenharAtividade()
      _focarComentario(id, '[data-coment-acao="versoes"]')
    }
  })
  feed?.addEventListener('input', e => {
    if (D.comentEditando && e.target.dataset.comentRascunho === D.comentEditando.id) D.comentEditando.rascunho = e.target.value
  })
  feed?.addEventListener('keydown', e => {
    const id = e.target.dataset?.comentRascunho
    if (!id) return
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _fecharEdicaoComentario(id) }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); _salvarComentario(id) }
  })

  document.querySelectorAll('[data-indicar]').forEach(btn => {
    btn.addEventListener('click', () => _indicarCotacao(btn.dataset.indicar))
  })
  document.getElementById('btn-add-cotacao')?.addEventListener('click', _mostrarModalCotacao)
  document.getElementById('btn-comparar-cotacoes')?.addEventListener('click', _compararCotacoes)
  document.getElementById('btn-editar-pedido')?.addEventListener('click', _editarPedido)

  document.getElementById('btn-reabrir-pedido')?.addEventListener('click', () => {
    document.getElementById('reabrir-justificativa').value = ''
    abrirModal('modal-reabrir')
  })
  document.getElementById('btn-confirmar-reabrir')?.addEventListener('click', _reabrirPedido)

  ;['btn-duplicar-pedido', 'btn-comprar-de-novo'].forEach(id => document.getElementById(id)?.addEventListener('click', () => {
    agendarDuplicar(D.pedido, { deNovo: id === 'btn-comprar-de-novo' })
    navegar('pedidos')
  }))
  document.getElementById('btn-exportar-pdf')?.addEventListener('click', _exportarPedidoPDF)
  document.getElementById('btn-para-inventario')?.addEventListener('click', () => {
    const p = D.pedido
    navegar('equipamentos', { novo: 'equipamento', desc: (p.titulo || '').slice(0, 120), valor: p.valorFinal || '', forn: p.fornecedorNome || '',
      pedido: D.pedidoId, num: p.numeroPedido || '', empresa: p.empresaId || '', data: String(p.dataEntrega || p.dataCompra || '').slice(0, 10) })
  })
  document.getElementById('btn-registrar-retirada')?.addEventListener('click', _registrarRetirada)
  document.getElementById('btn-autorizacao')?.addEventListener('click', _gerarAutorizacao)

  _bindParcelasEvents()

  // Labels usados como botão de upload respondem a Enter/Espaço
  document.querySelectorAll('#detalhe-root label[tabindex="0"]').forEach(l => {
    l.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); l.querySelector('input[type=file]')?.click() }
    })
  })

  document.getElementById('input-upload-anexo')?.addEventListener('change', e => {
    Array.from(e.target.files || []).forEach(f => _uploadAnexo(f))
    e.target.value = ''
  })

  _bindAnexosEvents()
}
