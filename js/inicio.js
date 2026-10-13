// Primeiro script da página (clássico, no <head>, antes de qualquer pintura).
// Fica num arquivo, e não inline no index.html, para a política de segurança
// (CSP, firebase.json) não precisar liberar scripts inline.

// Tema salvo aplicado antes de qualquer pintura: o splash e a primeira tela
// já nascem no tema certo (sem piscar escuro no tema claro)
(function () {
  try {
    var salvo = localStorage.getItem('praxis_theme');
    var claro = salvo ? salvo === 'light' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
    if (claro) {
      document.documentElement.classList.add('light');
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', '#EFE6D7');
    }
  } catch (e) {}
})();

/* Registro de erros da página: exceções, promessas rejeitadas, console.error,
   recursos que não carregaram e respostas HTTP de erro do fetch.
   Consulte no console com errosRegistrados(). Nada aqui pode lançar erro. */
(function () {
  var lista = [];
  function registrar(tipo, msg) {
    try { lista.push({ tipo: tipo, msg: String(msg).slice(0, 500), pagina: location.pathname + location.search, quando: new Date().toISOString() }); } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    var alvo = e.target;
    if (alvo && alvo !== window && (alvo.src || alvo.href)) registrar('recurso', alvo.src || alvo.href);
    else registrar('erro', (e.message || 'erro') + (e.filename ? ' (' + e.filename + ':' + e.lineno + ')' : ''));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason; registrar('promessa', r && r.message ? r.message : r);
  });
  var erroOriginal = console.error;
  console.error = function () {
    try { registrar('console', Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {}
    return erroOriginal.apply(console, arguments);
  };
  if (window.fetch) {
    var fetchOriginal = window.fetch;
    window.fetch = function (recurso, opcoes) {
      var url = recurso && recurso.url ? recurso.url : recurso;
      return fetchOriginal.apply(this, arguments).then(function (resp) {
        // Senha errada ou e-mail sem conta voltam como 400 da API de
        // autenticação: é resposta esperada, que a tela de entrada traduz
        // e mostra. Não conta como erro da página.
        var authEsperado = resp.status === 400 && /identitytoolkit\.googleapis\.com\/v1\/accounts:(signInWithPassword|sendOobCode)/.test(String(url));
        if (!resp.ok && !authEsperado) registrar('http', resp.status + ' ' + url);
        return resp;
      }, function (err) {
        // Sem internet a falha de rede é esperada (o aviso offline já informa); não conta como erro
        // O canal de escuta do Firestore (Listen/channel) é abortado quando a
        // navegação ou o recarregamento fecha a conexão; o SDK reconecta sozinho.
        var escutaFirestore = /google\.firestore\.v1\.Firestore\/Listen\/channel/.test(String(url));
        if (navigator.onLine !== false && !escutaFirestore) registrar('rede', url + ': ' + err);
        throw err;
      });
    };
  }
  window.errosRegistrados = function () { return lista.slice(); };
})();

// Splash: sai logo depois que a página carrega
window.addEventListener('load', function () {
  setTimeout(function () {
    var splash = document.getElementById('splash');
    if (splash) {
      splash.classList.add('hide');
      setTimeout(function () { splash.remove(); }, 350);
    }
  }, 450);
});
