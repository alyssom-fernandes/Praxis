// ── Pessoas da demonstração ───────────────────────────────────
// Como no FuelMind: quem entra na demo escolhe quem quer ser, um perfil por
// pessoa, para ver o que cada nível de permissão vê e pode fazer. O login é
// sempre o mesmo (a conta demo); a pessoa escolhida vale dentro do app
// (sessao.usuario) e fica guardada na aba do navegador. Os perfis dessas
// pessoas são recriados a cada renovação da demo (js/demo-reset.js).
import { t, PERFIS_LABEL } from './constants.js'
import { frisoGrego } from './ui.js'
import { gerarIniciais, esc } from './utils.js'

// empresas: chaves do seed (assets/demo/seed.json); vazio = todas
export const PESSOAS_DEMO = [
  { id: 'demo-supremo',     nome: 'Artur Mendes',    perfil: 'supremo',     email: 'artur.mendes@demo.praxis',    empresas: [] },
  { id: 'demo-gestor',      nome: 'Beatriz Nunes',   perfil: 'gestor',      email: 'beatriz.nunes@demo.praxis',   empresas: ['nexara', 'veltora'] },
  { id: 'demo-aprovador',   nome: 'Carlos Ferreira', perfil: 'aprovador',   email: 'carlos.ferreira@demo.praxis', empresas: [] },
  { id: 'demo-comprador',   nome: 'Diana Alves',     perfil: 'comprador',   email: 'diana.alves@demo.praxis',     empresas: [] },
  { id: 'demo-financeiro',  nome: 'Eduardo Lima',    perfil: 'financeiro',  email: 'eduardo.lima@demo.praxis',    empresas: [] },
  { id: 'demo-solicitante', nome: 'Fernanda Costa',  perfil: 'solicitante', email: 'fernanda.costa@demo.praxis',  empresas: [] },
]
export const PESSOA_PADRAO = 'demo-supremo'

// Colegas das empresas de exemplo: abrem pedidos e aparecem em Usuários, mas
// não dá para entrar como eles (cada pessoa acima já cobre um perfil)
export const COLEGAS_DEMO = [
  { id: 'demo-gustavo', nome: 'Gustavo Ramos', perfil: 'solicitante', email: 'gustavo.ramos@demo.praxis', empresas: ['nexara'] },
  { id: 'demo-helena',  nome: 'Helena Prado',  perfil: 'solicitante', email: 'helena.prado@demo.praxis',  empresas: ['veltora'] },
  { id: 'demo-igor',    nome: 'Igor Tavares',  perfil: 'solicitante', email: 'igor.tavares@demo.praxis',  empresas: ['orbix'] },
]

const _CHAVE = 'praxis_demo_pessoa'

export function pessoaEscolhida() {
  try {
    const id = sessionStorage.getItem(_CHAVE)
    return PESSOAS_DEMO.some(p => p.id === id) ? id : PESSOA_PADRAO
  } catch { return PESSOA_PADRAO }
}

export function escolherPessoa(id) {
  try { sessionStorage.setItem(_CHAVE, id) } catch {}
}

export function esquecerPessoa() {
  try { sessionStorage.removeItem(_CHAVE) } catch {}
}

// Tela de escolha. modo 'entrar' (antes do login, aberta por "Acessar modo
// demo") ou 'trocar' (pela faixa da demo, já dentro do app).
// aoEscolher(id) é chamado depois que a tela fecha; aoFechar() se a pessoa
// voltar sem escolher.
export function abrirEscolhaPessoa({ modo = 'entrar', aoEscolher, aoFechar } = {}) {
  if (document.getElementById('boas-vindas-overlay')) return
  const atual = modo === 'trocar' ? pessoaEscolhida() : null
  const overlay = document.createElement('div')
  overlay.id = 'boas-vindas-overlay'
  overlay.className = 'bv-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', 'bv-titulo')
  overlay.setAttribute('aria-describedby', 'bv-texto')

  overlay.innerHTML = `
    <div class="bv-card">
      <div class="bv-corpo">
        <p class="bv-rotulo">${t('demoFaixaTitulo')}</p>
        <h2 class="bv-titulo" id="bv-titulo">${t(modo === 'trocar' ? 'demoTrocarTitulo' : 'demoEscolherTitulo')}</h2>
        <p class="bv-texto" id="bv-texto">${t('demoEscolherTexto')}</p>
        <ul class="bv-pessoas">
          ${PESSOAS_DEMO.map((p, i) => `
          <li>
            <button type="button" class="bv-pessoa ${p.id === atual ? 'atual' : ''}" data-pessoa="${p.id}"
              ${i === 0 ? 'id="bv-comecar"' : ''} ${p.id === atual ? 'aria-current="true"' : ''}>
              <span class="bv-pessoa-n" aria-hidden="true">${gerarIniciais(p.nome)}</span>
              <span class="bv-pessoa-texto">
                <span class="bv-pessoa-nome">${esc(p.nome)}</span>
                <span class="bv-pessoa-papel">${esc(PERFIS_LABEL[p.perfil] || p.perfil)}${p.id === atual ? ` · ${t('demoPessoaAtual')}` : ''}</span>
                <span class="bv-pessoa-desc">${t(`demoPessoaDesc_${p.perfil}`)}</span>
              </span>
            </button>
          </li>`).join('')}
        </ul>
        <div class="bv-acoes">
          <button type="button" class="btn-ghost" id="bv-voltar">${t('voltar')}</button>
        </div>
      </div>
      ${frisoGrego({ classe: 'bv-friso' })}
    </div>
  `

  document.body.appendChild(overlay)
  const app = document.getElementById('app')
  if (app) app.inert = true
  requestAnimationFrame(() => overlay.classList.add('visible'))
  setTimeout(() => (overlay.querySelector('.bv-pessoa.atual') || overlay.querySelector('#bv-comecar'))?.focus({ preventScroll: true }), 60)

  const fechar = depois => {
    document.removeEventListener('keydown', aoTeclar)
    overlay.classList.remove('visible')
    if (app) app.inert = false
    setTimeout(() => { overlay.remove(); depois?.() }, 200)
  }
  // Esc fecha; Tab fica preso nos botões da tela (o que está atrás está inerte)
  const aoTeclar = e => {
    if (e.key === 'Escape') { fechar(aoFechar); return }
    if (e.key !== 'Tab') return
    const botoes = [...overlay.querySelectorAll('button')]
    const i = botoes.indexOf(document.activeElement)
    e.preventDefault()
    botoes[e.shiftKey ? (i <= 0 ? botoes.length - 1 : i - 1) : (i + 1) % botoes.length]?.focus()
  }
  document.addEventListener('keydown', aoTeclar)

  overlay.addEventListener('click', e => {
    if (e.target === overlay) { fechar(aoFechar); return }
    const b = e.target.closest('[data-pessoa]')
    if (!b) return
    const id = b.dataset.pessoa
    escolherPessoa(id)
    fechar(() => aoEscolher?.(id))
  })
  overlay.querySelector('#bv-voltar').addEventListener('click', () => fechar(aoFechar))
}
