// Primeiro acesso de quem entra sem e-mail (A3): a senha inicial, criada pelo
// gestor, é trocada antes de usar o app. A janela não fecha sem a senha nova.
import { auth, db, doc, updateDoc, updatePassword } from './firebase.js'
import { t } from './constants.js'
import { abrirModal, fecharModal } from './ui.js'
import { erroDaSenhaNova } from './acesso.js'

export function pedirSenhaNova(usuario) {
  return new Promise(resolve => {
    document.getElementById('modal-senha-nova')?.remove()
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.id = 'modal-senha-nova'
    // Não fecha com Esc (js/ui.js): o app só segue com a senha nova
    overlay.dataset.fixo = '1'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-labelledby', 'sn-titulo')
    overlay.innerHTML = `
      <div class="modal" data-estilo="max-width:440px">
        <div class="modal-header"><h2 id="sn-titulo">${t('senhaNovaTitulo')}</h2></div>
        <div class="modal-body">
          <p class="modal-intro">${t('senhaNovaIntro')}</p>
          <form id="form-senha-nova" novalidate>
            <div class="form-group" data-campo="sn-senha">
              <label for="sn-senha">${t('senhaNovaCampo')}</label>
              <input type="password" id="sn-senha" autocomplete="new-password" minlength="8" required>
            </div>
            <div class="form-group" data-campo="sn-confirma">
              <label for="sn-confirma">${t('senhaNovaConfirma')}</label>
              <input type="password" id="sn-confirma" autocomplete="new-password" minlength="8" required>
            </div>
            <p class="form-error" id="sn-erro" role="alert" hidden></p>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-primary" id="sn-salvar" form="form-senha-nova" type="submit">${t('senhaNovaSalvar')}</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
    const erro = overlay.querySelector('#sn-erro')
    const mostrar = msg => { erro.textContent = msg; erro.hidden = !msg }
    overlay.querySelector('#form-senha-nova').addEventListener('submit', async e => {
      e.preventDefault()
      const nova = overlay.querySelector('#sn-senha').value
      const confirma = overlay.querySelector('#sn-confirma').value
      const problema = erroDaSenhaNova(nova, confirma)
      if (problema) { mostrar(t(problema)); return }
      const btn = overlay.querySelector('#sn-salvar')
      btn.disabled = true
      try {
        await updatePassword(auth.currentUser, nova)
        await updateDoc(doc(db, 'usuarios', usuario.id), { trocarSenha: false })
        usuario.trocarSenha = false
        fecharModal('modal-senha-nova')
        setTimeout(() => overlay.remove(), 250)
        resolve(true)
      } catch (err) {
        console.error(err)
        mostrar(t(err?.code === 'auth/weak-password' ? 'senhaCurta' : 'senhaNovaErro'))
        btn.disabled = false
      }
    })
    abrirModal('modal-senha-nova')
    overlay.querySelector('#sn-senha').focus()
  })
}
