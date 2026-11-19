# Security

## Reporting a vulnerability

Please report it privately, through this repository's **Security** tab, **Report a vulnerability**. Do not open a public issue.

Include what you found, the steps to reproduce it and what an attacker could reach. You will get an answer in the same report.

## What is covered

- The code on the `main` branch and the live demo at [praxis-af618.web.app](https://praxis-af618.web.app).
- The Firestore and Storage security rules (`firestore.rules`, `storage.rules`), which enforce each role on the server.

The demo data is fictitious and is rebuilt every day. The demo account's password ships in the public `js/config.js` on purpose: the rules give it a role of its own that only reaches demo records. Reaching anything else with it is a vulnerability.

---

# Segurança

## Como avisar uma falha

Avise em particular, pela aba **Security** deste repositório, em **Report a vulnerability**. Não abra uma issue pública.

Conte o que encontrou, os passos para reproduzir e o que alguém mal-intencionado conseguiria alcançar. A resposta vem no próprio aviso.

## O que está coberto

- O código do ramo `main` e a demonstração no ar em [praxis-af618.web.app](https://praxis-af618.web.app).
- As regras de segurança do Firestore e do Storage (`firestore.rules`, `storage.rules`), que garantem cada perfil no servidor.

Os dados da demonstração são fictícios e refeitos todo dia. A senha da conta de demonstração vai no `js/config.js` público de propósito: as regras dão a ela um perfil próprio, que só alcança registros da demonstração. Alcançar qualquer outra coisa com ela é uma falha.
