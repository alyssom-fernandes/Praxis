export const STATUS = {
  SOLICITADO:   'solicitado',
  AG_COTACAO:   'ag_cotacao',
  EM_APROVACAO: 'em_aprovacao',
  APROVADO:     'aprovado',
  COMPRADO:     'comprado',
  ENTREGUE:     'entregue',
  PAGO:         'pago',
  REPROVADO:    'reprovado',
  CANCELADO:    'cancelado',
}

export const STATUS_LABEL = {
  solicitado:   'Solicitado',
  ag_cotacao:   'Ag. cotação',
  em_aprovacao: 'Em aprovação',
  aprovado:     'Aprovado',
  comprado:     'Comprado',
  entregue:     'Entregue',
  pago:         'Pago',
  reprovado:    'Reprovado',
  cancelado:    'Cancelado',
}

export const STATUS_COLOR = {
  solicitado:   'neutral',
  ag_cotacao:   'blue',
  em_aprovacao: 'gold',
  aprovado:     'green',
  comprado:     'green',
  entregue:     'green',
  pago:         'green',
  reprovado:    'red',
  cancelado:    'red',
}

export const STATUS_DOT_COLOR = {
  solicitado:   'dot-gray',
  ag_cotacao:   'dot-blue',
  em_aprovacao: 'dot-gold',
  aprovado:     'dot-green',
  comprado:     'dot-green',
  entregue:     'dot-green',
  pago:         'dot-green',
  reprovado:    'dot-red',
  cancelado:    'dot-red',
}

export const PERFIS = {
  SUPREMO:     'supremo',
  GESTOR:      'gestor',
  APROVADOR:   'aprovador',
  COMPRADOR:   'comprador',
  FINANCEIRO:  'financeiro',
  SOLICITANTE: 'solicitante',
}

export const PERFIS_LABEL = {
  supremo:     'Supremo',
  gestor:      'Gestor',
  aprovador:   'Aprovador',
  comprador:   'Comprador',
  financeiro:  'Financeiro',
  solicitante: 'Solicitante',
}

export const PERFIS_COLOR = {
  supremo:     'gold',
  gestor:      'green',
  aprovador:   'blue',
  comprador:   'neutral',
  financeiro:  'neutral',
  solicitante: 'neutral',
}

export const MOTIVOS_REPROVACAO = [
  'Valor acima do orçamento',
  'Cotações insuficientes',
  'Justificativa inadequada',
  'Fornecedor não aprovado',
  'Outros',
]

export const MOTIVOS_CANCELAMENTO = [
  'Compra não necessária',
  'Fornecedor indisponível',
  'Erro no pedido',
  'Pedido duplicado',
  'Outros',
]

export const CATEGORIAS_PADRAO = [
  { nome: 'Manutenção',       cor: '#E05040' },
  { nome: 'Escritório',       cor: '#5BA3E0' },
  { nome: 'Operacional',      cor: '#C8A96E' },
  { nome: 'Alimentação',      cor: '#4EC08A' },
  { nome: 'Uniformes e EPIs', cor: '#A07FD0' },
  { nome: 'Marketing',        cor: '#E0A040' },
  { nome: 'TI',               cor: '#40B8D0' },
  { nome: 'Serviços',         cor: '#8A8278' },
]

export const EVENTOS = {
  PEDIDO_URGENTE:        'pedido_urgente',
  AG_COTACAO:            'ag_cotacao',
  COMPRADOR_ASSUMIU:     'comprador_assumiu',
  COTACOES_PRONTAS:      'cotacoes_prontas',
  PEDIDO_APROVADO:       'pedido_aprovado',
  PEDIDO_REPROVADO:      'pedido_reprovado',
  PEDIDO_CANCELADO:      'pedido_cancelado',
  PEDIDO_COMPRADO:       'pedido_comprado',
  PEDIDO_ENTREGUE:       'pedido_entregue',
  PARCELA_VENCENDO:      'parcela_vencendo',
  PARCELA_VENCIDA:       'parcela_vencida',
  MENCAO_COMENTARIO:     'mencao_comentario',
  PEDIDO_PARADO:         'pedido_parado',
  PEDIDO_ENTREGUE_SOLIC: 'pedido_entregue_solic',
}

export const EVENTOS_ICON_CLASS = {
  pedido_urgente:        'notif-icon-red',
  ag_cotacao:            'notif-icon-blue',
  comprador_assumiu:     'notif-icon-gold',
  cotacoes_prontas:      'notif-icon-blue',
  pedido_aprovado:       'notif-icon-green',
  pedido_reprovado:      'notif-icon-red',
  pedido_cancelado:      'notif-icon-red',
  pedido_comprado:       'notif-icon-green',
  pedido_entregue:       'notif-icon-green',
  parcela_vencendo:      'notif-icon-gold',
  parcela_vencida:       'notif-icon-red',
  mencao_comentario:     'notif-icon-gold',
  pedido_parado:         'notif-icon-gold',
  pedido_entregue_solic: 'notif-icon-green',
}

export const UNIDADES = [
  'un', 'cx', 'kg', 'L', 'm', 'm²', 'm³',
  'par', 'pct', 'kit', 'rolo', 'saco',
  'hora', 'mês', 'pessoa', 'licença', 'serviço',
]

export const CONDICAO_PAGAMENTO = {
  antecipado:         'Antecipado',
  apos_recebimento:   'Após recebimento',
}

// ── Traduções (modo demo) ────────────────────────────────────
export const TRADUCOES = {
  pt: {
    titulo:           'Pedidos',
    relatorios:       'Relatórios',
    configuracoes:    'Configurações',
    btnEntrar:        'Entrar',
    btnDemo:          'Acessar modo demo',
    tagline:          'Gestão de compras corporativas',
    emailLabel:       'E-mail',
    senhaLabel:       'Senha',
    esqueci:          'Esqueci a senha',
    escolherIdioma:   'Escolha o idioma do demo',
    continuar:        'Continuar',
    voltar:           'Voltar',
    novoPedido:       'Novo pedido',
    todos:            'Todos',
    urgentes:         'Urgentes',
    meusPedidos:      'Meus pedidos',
    estaSemana:       'Esta semana',
    resetEnviado:     'E-mail de recuperação enviado',
    resetMsg:         'Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.',
    emailReset:       'Digite seu e-mail para receber o link de recuperação',
    enviarLink:       'Enviar link',
  },
  en: {
    titulo:           'Orders',
    relatorios:       'Reports',
    configuracoes:    'Settings',
    btnEntrar:        'Sign in',
    btnDemo:          'Try demo mode',
    tagline:          'Corporate procurement management',
    emailLabel:       'Email',
    senhaLabel:       'Password',
    esqueci:          'Forgot password',
    escolherIdioma:   'Choose demo language',
    continuar:        'Continue',
    voltar:           'Back',
    novoPedido:       'New order',
    todos:            'All',
    urgentes:         'Urgent',
    meusPedidos:      'My orders',
    estaSemana:       'This week',
    resetEnviado:     'Recovery email sent',
    resetMsg:         'Check your inbox and follow the instructions to reset your password.',
    emailReset:       'Enter your email to receive the recovery link',
    enviarLink:       'Send link',
  },
}

export function t(chave, lang) {
  const idioma = lang || sessionStorage.getItem('praxis_lang') || 'pt'
  return TRADUCOES[idioma]?.[chave] ?? chave
}

export const KANBAN_COLUNAS = [
  STATUS.SOLICITADO,
  STATUS.AG_COTACAO,
  STATUS.EM_APROVACAO,
  STATUS.APROVADO,
  STATUS.COMPRADO,
  STATUS.ENTREGUE,
  STATUS.PAGO,
]

export const STORAGE_PATHS = {
  cotacao:     (pedidoId, cotacaoId) => `pedidos/${pedidoId}/cotacoes/${cotacaoId}`,
  comprovante: (pedidoId, parcelaId) => `pedidos/${pedidoId}/comprovantes/${parcelaId}`,
}
