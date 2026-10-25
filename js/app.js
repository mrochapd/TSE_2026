(function () {
  const INTERVALO = 30; // segundos entre atualizações
  const $ = id => document.getElementById(id);
  const fmt = new Intl.NumberFormat('pt-BR');
  const fmtPct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = x => fmtPct.format(x || 0) + '%';
  const n = x => (x == null ? '—' : fmt.format(x));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const S = {
    ufs: [],             // configuração: [{cd, nome, mu:[{cd, cdi, nome, capital, zonas}]}]
    sel: { uf: null, pais: null, mu: null, zona: null },
    paises: [],          // exterior agrupado: [{slug, nome, cidades:[município da config]}]
    aba: 'br',
    atual: null,         // resultado da região selecionada
    porUF: {},           // uf -> resultado
    porMu: {},           // uf -> { cdMunicípio -> resultado }
    porZona: {},         // uf+mu -> { zona -> resultado }
    ordem: { campo: 'nome', dir: 1 },
    geracao: 0,          // invalida respostas de navegações antigas
    contador: INTERVALO,
    ciclos: 0,
    carregando: false,
    mapaMunUF: null,     // UF cujo mapa municipal está desenhado
    mapaMundo: false,    // o mapa-múndi está desenhado
    modoMapa: 'brasil',  // página inicial: 'brasil' (estados) ou 'mundo'
    paisPorIso: {},      // código ISO do país → país do exterior
    muCarregado: new Set(), // UFs cujos municípios já foram baixados ao menos uma vez
    muEmCurso: new Set(),
    brasil: null,        // resultado do Brasil (inclui o exterior)
    indice: null,        // andamento por abrangência, do índice do TSE
    fotos: {}
  };

  // ---------- Utilidades de configuração ----------
  const ufCfg = uf => S.ufs.find(u => u.cd === uf) || null;
  const muCfg = (uf, mu) => { const u = ufCfg(uf); return u ? u.mu.find(m => m.cd === mu) || null : null; };
  const nomeUF = uf => (uf === 'zz' ? 'Exterior' : (ufCfg(uf) || {}).nome || uf.toUpperCase());
  const paisCfg = slug => S.paises.find(p => p.slug === slug) || null;
  const paisDoMu = mu => S.paises.find(p => p.cidades.some(m => m.cd === mu)) || null;

  // O TSE publica o exterior por cidade; aqui as cidades são agrupadas por país.
  function montarPaises() {
    const u = ufCfg('zz');
    const grupos = {};
    for (const m of u ? u.mu : []) {
      const nome = EXTERIOR.paisDaCidade(m.nome, m.pais);
      (grupos[nome] || (grupos[nome] = [])).push(m);
    }
    S.paises = Object.entries(grupos).map(([nome, cidades]) => ({ slug: EXTERIOR.slug(nome), nome, cidades, iso: EXTERIOR.iso(nome) }))
      .sort((a, b) => (a.nome === EXTERIOR.OUTROS) - (b.nome === EXTERIOR.OUTROS) || a.nome.localeCompare(b.nome, 'pt-BR'));
    S.paisPorIso = {};
    S.paises.forEach(p => { if (p.iso) S.paisPorIso[p.iso] = p; });
  }

  // Resultado de um país do exterior = soma das suas cidades já baixadas.
  const resultadoPais = p => somarResultados(p.cidades.map(m => (S.porMu.zz || {})[m.cd]));
  // O mapa-múndi aparece na aba Exterior e, na página inicial, quando se escolhe "Mundo".
  const precisaMundo = () => S.sel.uf === 'zz' || (S.aba === 'br' && S.modoMapa === 'mundo');

  // Soma os resultados de várias cidades (total de um país).
  function somarResultados(lista) {
    const r = vazioPlacar();
    const campos = ['eleitorado', 'comparecimento', 'abstencao', 'validos', 'brancos', 'nulos'];
    let total = 0, apuradas = 0, algum = false;
    for (const x of lista) {
      if (!x) continue;
      algum = true;
      r.lula.votos += x.lula.votos; r.flavio.votos += x.flavio.votos;
      total += x.secoes.total || 0; apuradas += x.secoes.apuradas || 0;
      for (const c of campos) if (x[c] != null) r[c] = (r[c] || 0) + x[c];
      if (x.lula.sqcand) r.lula.sqcand = x.lula.sqcand;
      if (x.flavio.sqcand) r.flavio.sqcand = x.flavio.sqcand;
      if (x.atualizado && (!r.atualizado || dataTSE(x.atualizado) > dataTSE(r.atualizado))) r.atualizado = x.atualizado;
    }
    r.soma = r.lula.votos + r.flavio.votos;
    r.lula.pct = r.soma ? r.lula.votos / r.soma * 100 : 0;
    r.flavio.pct = r.soma ? r.flavio.votos / r.soma * 100 : 0;
    r.secoes = { total: total || null, apuradas: total ? apuradas : null, pct: total ? apuradas / total * 100 : 0 };
    if (!algum) r.semArquivo = true;
    return r;
  }
  // "25/10/2026 20:11:05" → número comparável
  const dataTSE = t => { const m = /(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)/.exec(t || ''); return m ? +(m[3] + m[2] + m[1] + m[4] + m[5] + m[6]) : 0; };

  // ---------- Cores ----------
  function faixa(p) { return p >= 70 ? 4 : p >= 60 ? 3 : p >= 55 ? 2 : 1; }
  function cor(r) {
    if (!r || !r.soma) return 'var(--sem-dados)';
    if (r.lula.votos === r.flavio.votos) return '#8e7cc3';
    return r.lula.votos > r.flavio.votos ? `var(--l${faixa(r.lula.pct)})` : `var(--f${faixa(r.flavio.pct)})`;
  }
  function vencedor(r) {
    if (!r || !r.soma || r.lula.votos === r.flavio.votos) return null;
    return r.lula.votos > r.flavio.votos ? 'l' : 'f';
  }

  // ---------- Rotas (#/uf/sp/mu/71072/zona/0001) ----------
  function hashDe(sel, aba) {
    if (!sel.uf) return aba === 'uf' ? '#/uf' : '#/br';
    let h = sel.uf === 'zz' ? '#/zz' : '#/uf/' + sel.uf;
    if (sel.uf === 'zz' && sel.pais) h += '/pais/' + sel.pais;
    if (sel.mu) h += '/mu/' + sel.mu;
    if (sel.mu && sel.zona) h += '/zona/' + sel.zona;
    return h;
  }
  function irPara(sel, aba) {
    const h = hashDe(sel, aba || (sel.uf === 'zz' ? 'zz' : sel.uf ? 'uf' : 'br'));
    if (location.hash === h) aplicarRota(); else location.hash = h;
  }
  function lerRota() {
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const sel = { uf: null, pais: null, mu: null, zona: null };
    let aba = 'br';
    if (p[0] === 'zz') { sel.uf = 'zz'; aba = 'zz'; p.shift(); }
    else if (p[0] === 'uf') { aba = 'uf'; if (p[1]) sel.uf = p[1].toLowerCase(); p.splice(0, 2); }
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] === 'pais') sel.pais = p[i + 1] || null;
      if (p[i] === 'mu') sel.mu = p[i + 1] || null;
      if (p[i] === 'zona') sel.zona = p[i + 1] || null;
    }
    // Ignora códigos que não existem na configuração.
    if (sel.uf && S.ufs.length && !ufCfg(sel.uf)) { sel.uf = null; sel.mu = null; }
    if (sel.mu && S.ufs.length && !muCfg(sel.uf, sel.mu)) sel.mu = null;
    if (!sel.mu) sel.zona = null;
    if (sel.uf !== 'zz') sel.pais = null;
    else if (S.paises.length) {
      if (sel.mu) sel.pais = (paisDoMu(sel.mu) || {}).slug || null; // cidade escolhida pela busca: descobre o país
      else if (sel.pais && !paisCfg(sel.pais)) sel.pais = null;
    }
    return { sel, aba };
  }
  function aplicarRota() {
    const { sel, aba } = lerRota();
    const mudouUF = sel.uf !== S.sel.uf || sel.pais !== S.sel.pais;
    S.sel = sel; S.aba = aba;
    if (mudouUF) $('filtro-tabela').value = '';
    atualizarControles();
    carregarVista(true);
  }

  // ---------- Controles ----------
  function preencherEstados() {
    const sel = $('sel-uf');
    sel.innerHTML = '<option value="">Selecione o estado</option>' + S.ufs
      .filter(u => u.cd !== 'zz')
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map(u => `<option value="${u.cd}">${esc(u.nome)} (${u.cd.toUpperCase()})</option>`).join('');
  }

  function atualizarControles() {
    const { uf, pais, mu, zona } = S.sel;
    document.querySelectorAll('.aba').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === S.aba)));
    const exterior = S.aba === 'zz';
    $('filtros').hidden = S.aba === 'br';
    $('campo-uf').hidden = exterior;
    $('campo-pais').hidden = !exterior;
    $('rotulo-mu').textContent = exterior ? 'Cidade' : 'Município';
    $('sel-uf').value = uf && uf !== 'zz' ? uf : '';
    $('sel-pais').value = pais || '';

    const u = uf ? ufCfg(uf) : null;
    const p = pais ? paisCfg(pais) : null;
    const m = mu ? muCfg(uf, mu) : null;

    // O que aparece em cada aba:
    //  Brasil   → placar geral (Brasil + exterior) e mapa por estado ou mapa-múndi
    //  Estados  → lista de estados; depois placar, mapa municipal e tabela de municípios/zonas
    //  Exterior → total do exterior e mapa-múndi por país; depois país → cidades → zonas
    const listaEstados = S.aba === 'uf' && !uf;
    $('sec-placar').hidden = listaEstados;
    $('sec-mapa').hidden = listaEstados;
    $('sec-tabela').hidden = S.aba === 'br' || (exterior && !p && !m) || (exterior && m && m.zonas.length < 2);
    $('dica-aba').hidden = S.aba !== 'br';
    $('dica-pais').hidden = !(exterior && !p && !m);

    const busca = $('busca-mu');
    busca.disabled = !u;
    busca.placeholder = u ? (exterior ? 'Buscar cidade…' : 'Buscar município…') : 'Escolha o estado antes';
    busca.value = m ? m.nome : '';
    $('limpar-mu').hidden = !busca.value;
    fecharSugestoes();

    const sz = $('sel-zona');
    sz.disabled = !m || !m.zonas.length;
    sz.innerHTML = '<option value="">' + (m ? 'Todas as zonas' : exterior ? 'Escolha uma cidade' : 'Escolha um município') + '</option>' +
      (m ? m.zonas.map(z => `<option value="${z}">Zona ${z}</option>`).join('') : '');
    sz.value = zona || '';

    // Trilha: Estados › São Paulo › Campinas › Zona 0033  (ou Exterior › Japão › Tóquio)
    const partes = [];
    $('trilha').hidden = S.aba === 'br'; // na página inicial o placar já diz "Brasil + exterior"
    if (S.aba !== 'br') {
      const link = (txt, sel, ativo) => (ativo ? `<a href="${hashDe(sel, S.aba)}">${esc(txt)}</a>` : `<strong>${esc(txt)}</strong>`);
      if (exterior) {
        partes.push(link('Exterior', { uf: 'zz' }, p || m));
        if (p) partes.push(link(p.nome, { uf: 'zz', pais }, m));
      } else {
        partes.push(link('Estados', { uf: null }, uf));
        if (uf) partes.push(link(nomeUF(uf), { uf }, m));
      }
      if (m) partes.push(link(m.nome, { uf, pais, mu }, zona));
      if (zona) partes.push(`<strong>Zona ${esc(zona)}</strong>`);
    }
    $('trilha').innerHTML = partes.join('<span class="sep">›</span>');
  }

  function preencherPaises() {
    $('sel-pais').innerHTML = '<option value="">Todos os países (total)</option>' +
      S.paises.map(p => `<option value="${p.slug}">${esc(p.nome)}</option>`).join('');
  }

  // ---------- Busca de município / cidade (lista própria: o <datalist> funciona mal no iPhone) ----------
  const semAcento = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  let sugestoes = [], sugAtiva = -1;

  function abrirSugestoes() {
    const u = ufCfg(S.sel.uf);
    const lista = $('sugestoes-mu'), busca = $('busca-mu');
    if (!u) return fecharSugestoes();
    const txt = semAcento(busca.value);
    const atual = S.sel.mu ? muCfg(S.sel.uf, S.sel.mu) : null;
    const filtro = atual && busca.value === atual.nome ? '' : txt; // ao tocar no campo já preenchido, mostra todos
    const comeca = [], contem = [];
    const p = S.sel.uf === 'zz' && S.sel.pais ? paisCfg(S.sel.pais) : null;
    for (const m of p ? p.cidades : u.mu) {
      const nome = semAcento(m.nome);
      if (!filtro || nome.startsWith(filtro)) comeca.push(m);
      else if (nome.includes(filtro)) contem.push(m);
    }
    sugestoes = comeca.concat(contem).slice(0, 60);
    sugAtiva = -1;
    lista.innerHTML = sugestoes.length
      ? sugestoes.map((m, i) => {
        const extra = S.sel.uf === 'zz' ? (p ? '' : esc((paisDoMu(m.cd) || {}).nome || '')) : m.capital ? 'capital' : '';
        return `<li role="option" id="sug-${i}" data-i="${i}">${esc(m.nome)}${extra ? `<small>${extra}</small>` : ''}</li>`;
      }).join('')
      : '<li class="vazio" role="option" aria-disabled="true">Nenhum resultado</li>';
    lista.hidden = false;
    lista.scrollTop = 0;
    busca.setAttribute('aria-expanded', 'true');
  }
  function fecharSugestoes() {
    $('sugestoes-mu').hidden = true;
    $('busca-mu').setAttribute('aria-expanded', 'false');
    $('busca-mu').removeAttribute('aria-activedescendant');
  }
  function escolherSugestao(i) {
    const m = sugestoes[i];
    if (!m) return;
    fecharSugestoes();
    $('busca-mu').blur();
    irPara({ uf: S.sel.uf, pais: S.sel.pais, mu: m.cd });
  }
  function marcarSugestao(i) {
    const itens = $('sugestoes-mu').querySelectorAll('li[data-i]');
    if (!itens.length) return;
    sugAtiva = (i + itens.length) % itens.length;
    itens.forEach((li, k) => li.classList.toggle('ativo', k === sugAtiva));
    itens[sugAtiva].scrollIntoView({ block: 'nearest' });
    $('busca-mu').setAttribute('aria-activedescendant', 'sug-' + sugAtiva);
  }

  function ligarBusca() {
    const busca = $('busca-mu'), lista = $('sugestoes-mu');
    busca.addEventListener('focus', abrirSugestoes);
    busca.addEventListener('input', () => { $('limpar-mu').hidden = !busca.value; abrirSugestoes(); });
    busca.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (lista.hidden) abrirSugestoes(); marcarSugestao(sugAtiva + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); marcarSugestao(sugAtiva - 1); }
      else if (e.key === 'Escape') fecharSugestoes();
      else if (e.key === 'Enter') { e.preventDefault(); escolherSugestao(sugAtiva >= 0 ? sugAtiva : 0); }
    });
    // mousedown + preventDefault: o toque escolhe o item antes de o campo perder o foco.
    lista.addEventListener('mousedown', e => e.preventDefault());
    lista.addEventListener('click', e => {
      const li = e.target.closest('li[data-i]');
      if (li) escolherSugestao(+li.dataset.i);
    });
    busca.addEventListener('blur', () => setTimeout(() => {
      fecharSugestoes();
      const atual = S.sel.mu ? muCfg(S.sel.uf, S.sel.mu) : null;
      if (busca.value.trim() === '' && atual) irPara({ uf: S.sel.uf, pais: S.sel.pais });
      else busca.value = atual ? atual.nome : '';
      $('limpar-mu').hidden = !busca.value;
    }, 200));
    $('limpar-mu').addEventListener('click', () => {
      busca.value = '';
      $('limpar-mu').hidden = true;
      if (S.sel.mu) irPara({ uf: S.sel.uf, pais: S.sel.pais });
      else busca.focus();
    });
    document.addEventListener('click', e => { if (!e.target.closest('.busca')) fecharSugestoes(); });
  }

  function ligarControles() {
    document.querySelectorAll('.aba').forEach(b => b.addEventListener('click', () => {
      const aba = b.dataset.aba;
      if (aba === 'br') irPara({ uf: null }, 'br');
      else if (aba === 'zz') irPara({ uf: 'zz' }, 'zz');
      else irPara({ uf: S.sel.uf && S.sel.uf !== 'zz' ? S.sel.uf : null }, 'uf');
    }));
    document.querySelectorAll('#alternar-mapa button').forEach(b => b.addEventListener('click', () => {
      if (S.modoMapa === b.dataset.modo) return;
      S.modoMapa = b.dataset.modo;
      prepararMapa(S.geracao);
      if (precisaMundo() && !S.muCarregado.has('zz')) carregarMunicipios('zz').then(pintarMapa);
    }));
    $('ir-estados').addEventListener('click', () => { irPara({ uf: null }, 'uf'); scrollTo(0, 0); });
    $('sel-uf').addEventListener('change', e => irPara({ uf: e.target.value || null }, 'uf'));
    $('sel-pais').addEventListener('change', e => irPara({ uf: 'zz', pais: e.target.value || null }, 'zz'));
    ligarBusca();
    $('sel-zona').addEventListener('change', e => irPara({ uf: S.sel.uf, pais: S.sel.pais, mu: S.sel.mu, zona: e.target.value || null }));
    $('btn-atualizar').addEventListener('click', () => atualizar(true));
    $('filtro-tabela').addEventListener('input', renderTabela);
    document.querySelectorAll('#tabela th[data-ord]').forEach(th => th.addEventListener('click', () => {
      const c = th.dataset.ord;
      S.ordem = { campo: c, dir: S.ordem.campo === c ? -S.ordem.dir : (c === 'nome' ? 1 : -1) };
      renderTabela();
    }));
    window.addEventListener('hashchange', aplicarRota);
    // iPhone e Android pausam a página em segundo plano: ao voltar, atualiza se os dados estiverem velhos.
    const aoVoltar = () => {
      if (document.hidden || !S.ufs.length) return;
      if (!ultimaHora || Date.now() - ultimaHora.getTime() > INTERVALO * 1000) atualizar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('pageshow', e => { if (e.persisted) aoVoltar(); });
    window.addEventListener('focus', aoVoltar);
  }

  // ---------- Placar ----------
  function tituloLocal() {
    const { uf, pais, mu, zona } = S.sel;
    if (!uf) return 'Brasil';
    const m = mu ? muCfg(uf, mu) : null;
    if (uf === 'zz') {
      const p = pais ? paisCfg(pais) : null;
      const local = m ? `${m.nome}${p && p.nome !== EXTERIOR.OUTROS ? ' – ' + p.nome : ''}` : p ? p.nome : 'Exterior';
      return zona && m ? `Zona ${zona} · ${local}` : local;
    }
    const sufixo = uf === 'zz' ? 'Exterior' : uf.toUpperCase();
    if (zona && m) return `Zona ${zona} · ${m.nome} – ${sufixo}`;
    if (m) return `${m.nome} – ${sufixo}`;
    return uf === 'zz' ? 'Exterior' : `${nomeUF(uf)} (${sufixo})`;
  }

  function renderPlacar(r) {
    $('titulo-local').textContent = tituloLocal();
    $('sobretitulo').textContent = !S.sel.uf ? 'Resultado geral · Brasil + exterior'
      : S.sel.uf === 'zz' && !S.sel.pais && !S.sel.mu ? 'Apuração total no exterior' : 'Resultado em';
    const { lula, flavio } = r;
    const temVotos = r.soma > 0;
    const pl = temVotos ? lula.pct : 50, pf = temVotos ? flavio.pct : 50;
    $('barra-duelo').classList.toggle('vazia', !temVotos);
    $('seg-lula').style.flexBasis = pl + '%';
    $('seg-flavio').style.flexBasis = pf + '%';
    $('seg-lula-pct').textContent = temVotos && pl >= 12 ? pct(pl) : '';
    $('seg-flavio-pct').textContent = temVotos && pf >= 12 ? pct(pf) : '';
    $('barra-duelo').setAttribute('aria-label', `Lula ${pct(lula.pct)} e Flávio Bolsonaro ${pct(flavio.pct)} dos votos válidos`);
    $('votos-lula-barra').textContent = n(lula.votos) + ' votos';
    $('votos-flavio-barra').textContent = n(flavio.votos) + ' votos';
    const dif = Math.abs(lula.votos - flavio.votos);
    const dv = $('dif-votos');
    if (!temVotos) {
      dv.textContent = r.semVotos ? 'O TSE ainda não publicou os votos por candidato' : r.semArquivo ? 'Aguardando dados do TSE' : 'Aguardando votos apurados';
      dv.style.color = '';
    }
    else if (!dif) { dv.textContent = 'Empate'; dv.style.color = ''; }
    else {
      const l = lula.votos > flavio.votos;
      dv.textContent = `${l ? 'Lula' : 'Flávio'} à frente por ${n(dif)} votos`;
      dv.style.color = l ? 'var(--lula)' : 'var(--flavio)';
    }

    // Sem votos por candidato publicados (exterior com arquivo desatualizado): mostra "—", não 0%.
    $('pct-lula').textContent = r.semVotos ? '—' : pct(lula.pct);
    $('pct-flavio').textContent = r.semVotos ? '—' : pct(flavio.pct);
    $('votos-lula').textContent = r.semVotos ? '—' : n(lula.votos);
    $('votos-flavio').textContent = r.semVotos ? '—' : n(flavio.votos);
    if (r.semVotos) { $('votos-lula-barra').textContent = '— votos'; $('votos-flavio-barra').textContent = '— votos'; }

    const v = vencedor(r);
    const completo = r.secoes.total > 0 && r.secoes.apuradas >= r.secoes.total;
    for (const [k, c] of [['lula', lula], ['flavio', flavio]]) {
      const lider = v === k.charAt(0);
      $('cand-' + k).classList.toggle('lider', lider);
      const selo = $('selo-' + k);
      let texto = '';
      if (!S.sel.uf && c.eleito) texto = 'ELEITO';
      else if (lider) texto = completo ? (S.sel.uf ? 'VENCEU AQUI' : 'MAIS VOTADO') : 'À FRENTE';
      selo.textContent = texto;
      selo.hidden = !texto;
      if (c.sqcand) S.fotos[k] = c.sqcand;
      mostrarFoto(k);
    }

    const sec = r.secoes;
    $('pct-urnas').textContent = pct(sec.pct);
    $('barra-urnas').style.width = Math.min(100, sec.pct || 0) + '%';
    $('progresso-urnas').setAttribute('aria-valuenow', String(Math.round(sec.pct || 0)));
    $('det-urnas').textContent = sec.total ? `${n(sec.apuradas)} de ${n(sec.total)} seções` : '—';

    const total = (r.validos || 0) + (r.brancos || 0) + (r.nulos || 0);
    const comPct = (x, base) => (x == null ? '—' : `${n(x)}<small>${base ? pct(x / base * 100) : ''}</small>`);
    $('n-eleitorado').innerHTML = n(r.eleitorado);
    const compBase = (r.comparecimento || 0) + (r.abstencao || 0);
    $('n-comparecimento').innerHTML = comPct(r.comparecimento, compBase);
    $('n-abstencao').innerHTML = comPct(r.abstencao, compBase);
    $('n-validos').innerHTML = comPct(r.validos, total);
    $('n-brancos').innerHTML = comPct(r.brancos, total);
    $('n-nulos').innerHTML = comPct(r.nulos, total);
    $('hora-tse').textContent = (r.atualizado ? 'gerado em ' + r.atualizado : (r.semArquivo ? 'arquivo ainda não publicado' : '—')) +
      (r.calculado ? ' · total do exterior calculado como total do Brasil menos a soma dos estados, porque o arquivo do exterior no TSE está desatualizado' : '');

    // País/cidade do exterior zerados enquanto o exterior já tem votos: o TSE ainda não atualizou esses arquivos.
    const aviso = $('aviso-dados');
    const ext = S.sel.uf === 'zz' && (S.sel.pais || S.sel.mu) ? exteriorTotal() : null;
    if (r.semVotos) {
      aviso.textContent = `O TSE já registra ${n(r.secoes.apuradas)} de ${n(r.secoes.total)} seções apuradas no exterior, ` +
        'mas ainda não atualizou o arquivo com os votos de cada candidato no exterior. ' +
        'Os percentuais aparecem aqui sozinhos assim que o TSE publicar.';
      aviso.hidden = false;
    } else if (ext && ext.secoes.apuradas > 0 && !r.secoes.apuradas) {
      aviso.innerHTML = 'O TSE ainda não publicou os votos por país e cidade do exterior: os arquivos dessas cidades continuam ' +
        'zerados. O andamento do exterior aparece em <a href="#/zz">Exterior › Todos os países</a>. ' +
        'Quando o TSE publicar, os números aparecem aqui sozinhos.';
      aviso.hidden = false;
    } else aviso.hidden = true;
  }

  function mostrarFoto(k) {
    const img = $('foto-' + k);
    const url = TSE.foto(S.fotos[k]);
    if (!url) { img.hidden = true; return; }
    if (img.dataset.src === url) return;
    img.dataset.src = url;
    img.onload = () => { img.hidden = false; };
    img.onerror = () => { img.hidden = true; };
    img.src = url;
  }

  // ---------- Mapa ----------
  const dica = $('dica');
  function htmlDica(nome, r, extra) {
    if (!r) return `<h4>${esc(nome)}</h4><div class="rodape-dica">Carregando…</div>`;
    return `<h4>${esc(nome)}</h4>
      <div class="linha"><span class="l">Lula</span><b>${pct(r.lula.pct)}</b></div>
      <div class="linha"><span class="f">Flávio</span><b>${pct(r.flavio.pct)}</b></div>
      <div class="rodape-dica">${r.soma && S.aba !== 'br' ? n(r.lula.votos) + ' × ' + n(r.flavio.votos) + ' votos · ' : ''}${pct(r.secoes.pct)} apurado${extra ? ' · ' + esc(extra) : ''}</div>
      ${S.aba === 'br' ? `<div class="rodape-dica">Votos detalhados na aba ${S.mapaMundo && nome !== 'Brasil (resultado geral)' ? 'Exterior' : 'Estados'}</div>` : ''}`;
  }
  function mostrarDica(html, ev) {
    dica.innerHTML = html; dica.hidden = false; moverDica(ev);
  }
  function moverDica(ev) {
    const w = dica.offsetWidth, h = dica.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
    dica.style.left = Math.max(8, x) + 'px'; dica.style.top = Math.max(8, y) + 'px';
  }
  function esconderDica() { dica.hidden = true; }
  window.addEventListener('scroll', () => { if (!dica.hidden) esconderDica(); }, { passive: true });

  function ligarEventosMapa(svg, nomeDe, resultadoDe, destinoDe) {
    // Passar o mouse mostra a dica só em computadores; no celular a dica aparece com o toque.
    svg.addEventListener('pointermove', ev => {
      if (ev.pointerType !== 'mouse') return;
      const p = ev.target.closest('.regiao');
      if (!p) { esconderDica(); return; }
      mostrarDica(htmlDica(nomeDe(p), resultadoDe(p)), ev);
    });
    svg.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') esconderDica(); });
    svg.addEventListener('click', ev => {
      const p = ev.target.closest('.regiao');
      if (!p) return;
      const destino = destinoDe(p);
      if (destino) { esconderDica(); irPara(destino); return; }
      // Sem destino (página inicial): no celular o toque mostra a dica do estado ou país.
      svg.querySelectorAll('.foco').forEach(x => x.classList.remove('foco'));
      p.classList.add('foco');
      mostrarDica(htmlDica(nomeDe(p), resultadoDe(p)), ev);
      clearTimeout(S.timerDica);
      S.timerDica = setTimeout(() => { esconderDica(); p.classList.remove('foco'); }, 4000);
    });
    svg.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const p = ev.target.closest('.regiao');
      if (!p) return;
      ev.preventDefault();
      const destino = destinoDe(p);
      if (destino) irPara(destino);
    });
  }

  function desenharMapaBrasil() {
    const M = window.MAPA_BRASIL;
    const caixa = $('mapa');
    caixa.classList.remove('municipal', 'mundo');
    S.mapaMunUF = null;
    S.mapaMundo = false;
    caixa.innerHTML = `<svg viewBox="${M.viewBox}" role="group" aria-label="Mapa do Brasil por estado">
      ${M.estados.map(e => `<path class="regiao" tabindex="0" data-uf="${e.id}" d="${e.d}" aria-label="${esc(e.nome)}"></path>`).join('')}
      <g class="rotulos"></g></svg>`;
    const svg = caixa.querySelector('svg');
    const g = svg.querySelector('.rotulos');
    const navegavel = S.aba === 'uf';
    svg.querySelectorAll('path').forEach(p => {
      if (!navegavel) p.setAttribute('tabindex', '-1');
      const b = p.getBBox();
      if (p.dataset.uf === 'df') return;
      const ajuste = { go: [-10, 8], pe: [10, 0], ba: [6, 0], rj: [4, 4], sc: [6, 0], ma: [6, 6], mg: [6, 4], sp: [0, 4], al: [2, 0], ap: [0, 8], pi: [-2, 10] }[p.dataset.uf] || [0, 0];
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', b.x + b.width / 2 + ajuste[0]);
      t.setAttribute('y', b.y + b.height / 2 + 4 + ajuste[1]);
      t.setAttribute('text-anchor', 'middle');
      t.textContent = p.dataset.uf.toUpperCase();
      g.appendChild(t);
    });
    ligarEventosMapa(svg,
      p => nomeUF(p.dataset.uf),
      p => S.porUF[p.dataset.uf],
      p => (S.aba === 'uf' ? { uf: p.dataset.uf } : null));
    S.mapaBrasilAba = S.aba;
    pintarMapa();
  }

  // Projeção equiretangular simples, corrigida pela latitude média (suficiente para um estado).
  function desenharMapaMunicipal(uf, geo) {
    const caixa = $('mapa');
    const feats = (geo && geo.features) || [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const percorrer = (coords, fn) => (typeof coords[0] === 'number' ? fn(coords) : coords.forEach(c => percorrer(c, fn)));
    feats.forEach(f => percorrer(f.geometry.coordinates, ([x, y]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }));
    const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
    const largura = 600, escala = largura / ((maxX - minX) * k || 1);
    const altura = Math.ceil((maxY - minY) * escala) || 400;
    const px = ([x, y]) => ((x - minX) * k * escala).toFixed(1) + ',' + ((maxY - y) * escala).toFixed(1);
    const anel = a => 'M' + a.map(px).join('L') + 'Z';
    const caminho = g => (g.type === 'Polygon' ? g.coordinates.map(anel).join('')
      : g.type === 'MultiPolygon' ? g.coordinates.map(p => p.map(anel).join('')).join('') : '');
    const u = ufCfg(uf);
    const porIBGE = {};
    (u ? u.mu : []).forEach(m => { if (m.cdi) porIBGE[m.cdi] = m; });

    caixa.classList.remove('mundo');
    caixa.classList.add('municipal');
    S.mapaMundo = false;
    caixa.innerHTML = `<svg viewBox="0 0 ${largura} ${altura}" role="group" aria-label="Mapa dos municípios de ${esc(nomeUF(uf))}">
      ${feats.map(f => {
        const m = porIBGE[String(f.properties.codarea)];
        return `<path class="regiao" tabindex="-1" ${m ? `data-mu="${m.cd}"` : ''} d="${caminho(f.geometry)}"><title>${esc(m ? m.nome : '')}</title></path>`;
      }).join('')}</svg>`;
    caixa.querySelectorAll('title').forEach(t => t.remove()); // usamos a dica própria
    const svg = caixa.querySelector('svg');
    ligarEventosMapa(svg,
      p => { const m = muCfg(uf, p.dataset.mu); return m ? m.nome : 'Município'; },
      p => (S.porMu[uf] || {})[p.dataset.mu],
      p => (p.dataset.mu ? { uf, mu: p.dataset.mu } : null));
    S.mapaMunUF = uf;
    pintarMapa();
  }

  // Mapa-múndi: cada país com seção eleitoral brasileira pintado pela cor de quem está à frente.
  // Na página inicial o Brasil entra com o resultado geral; na aba Exterior ele fica neutro.
  function desenharMapaMundo() {
    const M = window.MAPA_MUNDI;
    const caixa = $('mapa');
    caixa.classList.remove('municipal');
    caixa.classList.add('mundo');
    S.mapaMunUF = null;
    const ativo = iso => !!S.paisPorIso[iso] || (iso === '076' && S.aba === 'br');
    const classe = iso => (ativo(iso) ? 'regiao' : iso === '076' ? 'fundo brasil' : 'fundo');
    caixa.innerHTML = `<svg viewBox="${M.viewBox}" role="group" aria-label="Mapa-múndi por país">
      ${M.paises.map(p => `<path class="${classe(p.id)}" data-iso="${p.id}" d="${p.d}"></path>`).join('')}
      ${Object.entries(M.pontos).filter(([iso]) => ativo(iso))
        .map(([iso, [x, y]]) => `<circle class="regiao ponto" data-iso="${iso}" cx="${x}" cy="${y}" r="4"></circle>`).join('')}
    </svg>`;
    const svg = caixa.querySelector('svg');
    ligarEventosMapa(svg,
      el => (el.dataset.iso === '076' ? 'Brasil (resultado geral)' : (S.paisPorIso[el.dataset.iso] || {}).nome || ''),
      el => resultadoIso(el.dataset.iso),
      el => {
        const p = S.paisPorIso[el.dataset.iso];
        return S.aba === 'zz' && p ? { uf: 'zz', pais: p.slug } : null;
      });
    S.mapaMundo = true;
    S.mapaMundoAba = S.aba;
    pintarMapa();
  }

  function resultadoIso(iso) {
    if (iso === '076') return S.brasil;
    const p = S.paisPorIso[iso];
    return p ? resultadoPais(p) : null;
  }

  let pintura = 0;
  function pintarMapa() {
    if (pintura) return;
    pintura = requestAnimationFrame(() => {
      pintura = 0;
      const caixa = $('mapa');
      if (S.mapaMunUF) {
        const dados = S.porMu[S.mapaMunUF] || {};
        caixa.querySelectorAll('path.regiao').forEach(p => {
          p.style.fill = cor(dados[p.dataset.mu]);
          p.classList.toggle('selecionado', !!S.sel.mu && p.dataset.mu === S.sel.mu);
        });
      } else if (S.mapaMundo) {
        const sel = S.sel.uf !== 'zz' ? null : S.sel.mu ? paisDoMu(S.sel.mu) : S.sel.pais ? paisCfg(S.sel.pais) : null;
        caixa.querySelectorAll('.regiao').forEach(el => {
          el.style.fill = cor(resultadoIso(el.dataset.iso));
          el.classList.toggle('selecionado', !!sel && el.dataset.iso === sel.iso);
        });
      } else {
        caixa.querySelectorAll('path.regiao').forEach(p => {
          p.style.fill = cor(S.porUF[p.dataset.uf]);
          p.classList.toggle('selecionado', p.dataset.uf === S.sel.uf);
        });
      }
      renderPlacarMapa();
    });
  }

  function renderPlacarMapa() {
    const lista = S.mapaMundo ? S.paises.filter(p => p.iso).map(resultadoPais)
      : S.sel.uf ? Object.values(S.porMu[S.sel.uf] || {}) : S.ufs.filter(u => u.cd !== 'zz').map(u => S.porUF[u.cd]);
    const venc = { l: 0, f: 0 };
    lista.forEach(r => { const v = vencedor(r); if (v) venc[v]++; });
    const rotulo = S.mapaMundo ? 'países' : S.sel.uf ? 'municípios' : 'estados';
    let html = `<div class="contagem">
      <div class="c-l"><strong>${venc.l}</strong><span>${rotulo} com Lula à frente</span></div>
      <div class="c-f"><strong>${venc.f}</strong><span>${rotulo} com Flávio à frente</span></div></div>`;
    if (!S.mapaMundo && S.sel.uf && S.sel.uf !== 'zz' && S.porUF[S.sel.uf]) {
      const r = S.porUF[S.sel.uf];
      html += `<div class="mini-placar"><h3>Total de ${esc(nomeUF(S.sel.uf))}</h3>
        <div class="linha"><span style="color:var(--lula)">Lula</span><b>${pct(r.lula.pct)}</b></div>
        <div class="linha"><span style="color:var(--flavio)">Flávio</span><b>${pct(r.flavio.pct)}</b></div></div>`;
    }
    $('mapa-placar').innerHTML = html;
  }

  async function prepararMapa(geracao) {
    const uf = S.sel.uf;
    const aviso = $('mapa-carregando');
    $('alternar-mapa').hidden = S.aba !== 'br';
    document.querySelectorAll('#alternar-mapa button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modo === S.modoMapa)));
    $('legenda-fora').hidden = !precisaMundo();
    if (precisaMundo()) {
      const exterior = uf === 'zz';
      $('titulo-mapa').textContent = exterior ? 'Onde cada candidato venceu no exterior' : 'Onde cada candidato venceu no mundo';
      $('sub-mapa').textContent = exterior
        ? 'Cada país com seção eleitoral brasileira pintado com a cor de quem está à frente. Toque em um país para ver os votos dele.'
        : 'O Brasil (resultado geral) e os países com eleitores brasileiros, pintados com a cor de quem está à frente.';
      if (!S.mapaMundo || S.mapaMundoAba !== S.aba) desenharMapaMundo(); else pintarMapa();
      return;
    }
    if (!uf) {
      $('titulo-mapa').textContent = 'Onde cada candidato venceu';
      $('sub-mapa').textContent = 'Cada estado pintado com a cor de quem está à frente. Toque em um estado para ver o percentual.';
      if (S.mapaMunUF || S.mapaBrasilAba !== S.aba || !$('mapa').querySelector('svg[aria-label^="Mapa do Brasil"]')) desenharMapaBrasil(); else pintarMapa();
      return;
    }
    $('titulo-mapa').textContent = `Municípios de ${nomeUF(uf)}`;
    $('sub-mapa').textContent = 'Cada município pintado com a cor de quem está à frente. Toque para ver os detalhes.';
    if (S.mapaMunUF === uf) { pintarMapa(); return; }
    try {
      const geo = await TSE.malhaMunicipios(uf);
      if (geracao !== S.geracao || S.sel.uf !== uf) return;
      if (!geo || !geo.features || !geo.features.length) throw new Error('malha vazia');
      desenharMapaMunicipal(uf, geo);
    } catch (e) {
      if (geracao !== S.geracao) return;
      // Sem malha do IBGE (ex.: modo demonstração ou rede bloqueada): mostra o mapa dos estados.
      $('titulo-mapa').textContent = 'Onde cada candidato venceu';
      $('sub-mapa').textContent = `Mapa municipal indisponível no momento — exibindo os estados, com ${nomeUF(uf)} em destaque.`;
      if (S.mapaMunUF || S.mapaBrasilAba !== S.aba || !$('mapa').querySelector('svg')) desenharMapaBrasil(); else pintarMapa();
    }
  }

  // ---------- Tabela ----------
  function linhasTabela() {
    const { uf, pais, mu } = S.sel;
    if (!uf) {
      const l = S.ufs.filter(u => u.cd !== 'zz').map(u => ({ chave: u.cd, nome: u.nome, sub: u.cd.toUpperCase(), r: S.porUF[u.cd], destino: { uf: u.cd } }));
      return l;
    }
    if (mu) {
      const m = muCfg(uf, mu);
      const dados = S.porZona[uf + mu] || {};
      return (m ? m.zonas : []).map(z => ({ chave: z, nome: 'Zona ' + z, sub: m.nome, r: dados[z], destino: { uf, pais, mu, zona: z } }));
    }
    if (uf === 'zz') {
      const p = paisCfg(pais);
      const dados = S.porMu.zz || {};
      return (p ? p.cidades : []).map(m => ({ chave: m.cd, nome: m.nome, sub: '', r: dados[m.cd], destino: { uf, pais, mu: m.cd } }));
    }
    const u = ufCfg(uf);
    const dados = S.porMu[uf] || {};
    return (u ? u.mu : []).map(m => ({ chave: m.cd, nome: m.nome, sub: m.capital ? 'Capital' : '', r: dados[m.cd], destino: { uf, mu: m.cd } }));
  }

  function renderTabela() {
    const { uf, mu, zona } = S.sel;
    const p = uf === 'zz' && S.sel.pais ? paisCfg(S.sel.pais) : null;
    $('titulo-tabela').textContent = !uf ? 'Escolha um estado' : mu ? 'Resultado por zona eleitoral'
      : p ? `Resultado por cidade · ${p.nome}` : `Resultado por município · ${nomeUF(uf)}`;
    const sub = $('sub-tabela');
    sub.hidden = !!(uf && !mu && !p);
    sub.textContent = !uf ? 'Toque em um estado para ver o resultado dele, dos municípios e das zonas eleitorais.'
      : p ? 'Toque em uma cidade para ver o resultado dela.' : 'Toque em uma zona para ver o resultado dela.';
    const filtro = $('filtro-tabela').value.trim().toLowerCase();
    let linhas = linhasTabela().filter(l => !filtro || l.nome.toLowerCase().includes(filtro) || (l.sub || '').toLowerCase().includes(filtro));
    const { campo, dir } = S.ordem;
    const valor = l => campo === 'nome' ? l.nome : !l.r ? -1 : campo === 'lulaPct' ? l.r.lula.pct : campo === 'flavioPct' ? l.r.flavio.pct : l.r.secoes.pct;
    linhas.sort((a, b) => {
      const va = valor(a), vb = valor(b);
      return (typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') : va - vb) * dir;
    });
    document.querySelectorAll('#tabela th[data-ord]').forEach(th => {
      th.classList.toggle('ord-asc', th.dataset.ord === campo && dir === 1);
      th.classList.toggle('ord-desc', th.dataset.ord === campo && dir === -1);
    });
    const corpo = $('tabela-corpo');
    if (!linhas.length) {
      corpo.innerHTML = `<tr class="sem-clique"><td colspan="5" class="tabela-vazia">${filtro ? 'Nada encontrado para esse filtro.' : 'Sem dados para exibir.'}</td></tr>`;
      return;
    }
    corpo.innerHTML = linhas.map((l, i) => {
      const r = l.r;
      const v = vencedor(r);
      const atual = (mu && l.chave === zona);
      return `<tr data-i="${i}" class="${atual ? 'selecionado' : ''}" ${atual ? 'style="background:var(--realce)"' : ''}>
        <td class="nome-local ${v ? 'vencedor-' + v : ''}">${esc(l.nome)}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}<small class="apurado-mini">${r ? pct(r.secoes.pct) + ' apurado' : ''}</small></td>
        <td class="c-lula">${r ? pct(r.lula.pct) : '…'}<small>${r ? n(r.lula.votos) : ''}</small></td>
        <td class="c-barra"><div class="mini-barra">${r && r.soma ? `<i class="ml" style="width:${r.lula.pct}%"></i><i class="mf" style="width:${r.flavio.pct}%"></i>` : ''}</div></td>
        <td class="c-flavio">${r ? pct(r.flavio.pct) : '…'}<small>${r ? n(r.flavio.votos) : ''}</small></td>
        <td class="c-num">${r ? pct(r.secoes.pct) : '…'}</td></tr>`;
    }).join('');
    corpo.querySelectorAll('tr[data-i]').forEach(tr => tr.addEventListener('click', () => irPara(linhas[+tr.dataset.i].destino)));
  }

  let tabelaPendente = 0;
  function agendarTabela() {
    if (tabelaPendente) return;
    tabelaPendente = setTimeout(() => { tabelaPendente = 0; renderTabela(); }, 250);
  }

  // ---------- Carregamento ----------
  const completo = r => r && r.secoes.total > 0 && r.secoes.apuradas >= r.secoes.total;

  async function carregarUFs() {
    const lista = S.ufs.map(u => u.cd).concat(['br', 'indice']);
    await TSE.emLotes(lista, 6, async uf => {
      try {
        if (uf === 'br') S.brasil = await TSE.resultado(null);
        else if (uf === 'indice') S.indice = await TSE.indice();
        else { S.porUF[uf] = await TSE.resultado(uf); pintarMapa(); agendarTabela(); }
      } catch (e) { /* mantém o último valor conhecido */ }
    });
  }

  // Total do exterior. O TSE às vezes demora a atualizar o arquivo do exterior (zz), embora o
  // total do Brasil já inclua esses votos. Nesse caso o exterior é calculado como
  // Brasil − soma dos 27 estados, desde que o número de seções bata com o índice do TSE.
  function exteriorTotal() {
    const zz = S.porUF.zz, idx = S.indice && S.indice.zz;
    if (!zz || !idx || idx.apuradas == null || (zz.secoes.apuradas || 0) >= idx.apuradas) return zz || null;
    const calc = exteriorPorDiferenca();
    if (calc && calc.secoes.apuradas === idx.apuradas) return calc;
    // Sem como calcular os votos: mostra só o andamento informado pelo índice.
    return Object.assign(vazioPlacar(), {
      eleitorado: idx.eleitorado != null ? idx.eleitorado : zz.eleitorado,
      comparecimento: idx.comparecimento, abstencao: idx.abstencao,
      secoes: { total: idx.total, apuradas: idx.apuradas, pct: idx.total ? idx.apuradas / idx.total * 100 : 0 },
      atualizado: zz.atualizado, semVotos: true
    });
  }

  function exteriorPorDiferenca() {
    const br = S.brasil;
    const estados = S.ufs.filter(u => u.cd !== 'zz').map(u => S.porUF[u.cd]);
    if (!br || estados.some(r => !r)) return null;
    const est = somarResultados(estados);
    const dif = (a, b) => (a == null || b == null ? null : a - b);
    const r = vazioPlacar();
    r.lula.votos = br.lula.votos - est.lula.votos;
    r.flavio.votos = br.flavio.votos - est.flavio.votos;
    r.lula.sqcand = br.lula.sqcand; r.flavio.sqcand = br.flavio.sqcand;
    for (const c of ['eleitorado', 'comparecimento', 'abstencao', 'validos', 'brancos', 'nulos']) r[c] = dif(br[c], est[c]);
    const total = dif(br.secoes.total, est.secoes.total), apuradas = dif(br.secoes.apuradas, est.secoes.apuradas || 0);
    if ([r.lula.votos, r.flavio.votos, total, apuradas].some(x => x == null || x < 0)) return null;
    r.soma = r.lula.votos + r.flavio.votos;
    r.lula.pct = r.soma ? r.lula.votos / r.soma * 100 : 0;
    r.flavio.pct = r.soma ? r.flavio.votos / r.soma * 100 : 0;
    r.secoes = { total, apuradas, pct: total ? apuradas / total * 100 : 0 };
    r.atualizado = br.atualizado;
    r.calculado = true;
    return r;
  }

  // Baixa os municípios da UF (ou as cidades do exterior, para o mapa-múndi). Continua mesmo se o
  // usuário navegar dentro da mesma UF; para se ele trocar de UF ou sair do mapa-múndi.
  async function carregarMunicipios(uf) {
    const aindaPreciso = () => (uf === 'zz' ? precisaMundo() : S.sel.uf === uf);
    const u = ufCfg(uf);
    if (!u || S.muEmCurso.has(uf)) return;
    const dados = S.porMu[uf] || (S.porMu[uf] = {});
    const pendentes = u.mu.filter(m => !completo(dados[m.cd]));
    if (!pendentes.length) { S.muCarregado.add(uf); return; }
    S.muEmCurso.add(uf);
    const aviso = $('mapa-carregando');
    const primeiraVez = !S.muCarregado.has(uf);
    let feitos = 0, abortado = false;
    try {
      await TSE.emLotes(pendentes, 8, async m => {
        if (!aindaPreciso()) { abortado = true; return; }
        try { dados[m.cd] = await TSE.resultado(uf, m.cd); } catch (e) { /* tenta de novo na próxima rodada */ }
        feitos++;
        if (!aindaPreciso()) return;
        if (primeiraVez && pendentes.length > 20) {
          aviso.hidden = feitos >= pendentes.length;
          aviso.textContent = `Carregando ${uf === 'zz' ? 'cidades do exterior' : 'municípios'}: ${feitos} de ${pendentes.length}…`;
        }
        pintarMapa();
        agendarTabela();
      });
    } finally {
      S.muEmCurso.delete(uf);
      if (!abortado) S.muCarregado.add(uf);
      if (aindaPreciso() || abortado) aviso.hidden = true;
    }
  }

  // Total de um país do exterior = soma das suas cidades.
  async function carregarPais(slug) {
    const p = paisCfg(slug);
    if (!p) return vazioPlacar();
    const dados = S.porMu.zz || (S.porMu.zz = {});
    await TSE.emLotes(p.cidades.filter(m => !completo(dados[m.cd])), 6, async m => {
      try { dados[m.cd] = await TSE.resultado('zz', m.cd); } catch (e) { /* tenta de novo na próxima rodada */ }
    });
    return somarResultados(p.cidades.map(m => dados[m.cd]));
  }

  async function carregarZonas(uf, mu, geracao) {
    const m = muCfg(uf, mu);
    if (!m) return;
    const chave = uf + mu;
    const dados = S.porZona[chave] || (S.porZona[chave] = {});
    await TSE.emLotes(m.zonas.filter(z => !completo(dados[z])), 4, async z => {
      try { dados[z] = await TSE.resultado(uf, mu, z); } catch (e) { /* idem */ }
      if (geracao === S.geracao) agendarTabela();
    });
  }

  async function carregarVista(navegacao) {
    const geracao = navegacao ? ++S.geracao : S.geracao;
    const { uf, pais, mu, zona } = S.sel;
    const listaEstados = S.aba === 'uf' && !uf; // aba Estados antes de escolher o estado
    const totalPais = uf === 'zz' && pais && !mu; // país do exterior: soma das cidades
    if (navegacao) {
      // Mostra imediatamente o que já está em memória.
      if (!listaEstados) {
        const cache = zona ? (S.porZona[uf + mu] || {})[zona] : mu ? (S.porMu[uf] || {})[mu]
          : totalPais ? null : uf === 'zz' ? exteriorTotal() : uf ? S.porUF[uf] : S.atual && S.atual.br ? S.atual : null;
        renderPlacar(cache || vazioPlacar());
        prepararMapa(geracao);
      }
      renderTabela();
    }
    girar(true);
    try {
      if (!listaEstados) {
        const r = totalPais ? await carregarPais(pais) : await TSE.resultado(uf, mu, zona);
        if (geracao !== S.geracao) return;
        if (!uf) { r.br = true; S.brasil = r; }
        S.atual = r;
        if (zona) (S.porZona[uf + mu] || (S.porZona[uf + mu] = {}))[zona] = r;
        else if (mu) (S.porMu[uf] || (S.porMu[uf] = {}))[mu] = r;
        else if (uf && !totalPais) S.porUF[uf] = r;
        renderPlacar(uf === 'zz' && !pais && !mu ? exteriorTotal() || r : r);
      }
      status('vivo');

      const tarefas = [];
      // O mapa do Brasil precisa dos 27 estados + exterior; o placar do estado usa o total da UF.
      // O exterior também precisa do Brasil, dos estados e do índice (ver exteriorTotal).
      if (!uf || uf === 'zz' || Object.keys(S.porUF).length < S.ufs.length || (!navegacao && S.ciclos % 2 === 0)) tarefas.push(carregarUFs());
      const recarregarTudo = !navegacao && S.ciclos % 3 === 0; // municípios e cidades: a cada ~90 s
      if (uf && uf !== 'zz' && (!S.muCarregado.has(uf) || recarregarTudo)) tarefas.push(carregarMunicipios(uf));
      if (precisaMundo() && (!S.muCarregado.has('zz') || recarregarTudo)) tarefas.push(carregarMunicipios('zz'));
      if (uf && mu) tarefas.push(carregarZonas(uf, mu, geracao));
      await Promise.all(tarefas);
      if (geracao !== S.geracao) return;
      renderTabela();
      if (uf === 'zz') renderPlacar(!pais && !mu ? exteriorTotal() || S.atual : S.atual);
      if (!listaEstados) pintarMapa();
    } catch (e) {
      if (geracao !== S.geracao) return;
      status('erro', e);
    } finally {
      if (geracao === S.geracao) girar(false);
    }
  }

  function vazioPlacar() {
    return {
      lula: { votos: 0, pct: 0, eleito: false }, flavio: { votos: 0, pct: 0, eleito: false }, soma: 0,
      secoes: { total: null, apuradas: null, pct: 0 }, eleitorado: null, comparecimento: null, abstencao: null,
      validos: null, brancos: null, nulos: null, atualizado: null
    };
  }

  function girar(sim) { $('btn-atualizar').classList.toggle('girando', sim); }

  // ---------- Status / atualização automática ----------
  let ultimaHora = null;
  function status(tipo, erro) {
    const ponto = $('status-ponto'), texto = $('status-texto');
    ponto.className = 'status-ponto ' + (TSE.info.demo ? 'demo' : tipo);
    if (tipo === 'vivo') {
      ultimaHora = new Date();
      textoStatus();
    } else if (tipo === 'erro') {
      texto.textContent = 'Falha · tentando de novo';
      console.warn('Erro ao carregar dados', erro);
    }
  }
  function textoStatus() {
    if (!ultimaHora) return;
    const h = ultimaHora.toLocaleTimeString('pt-BR');
    $('status-texto').innerHTML = `<span class="status-rotulo">${TSE.info.demo ? 'Simulação' : 'Ao vivo'} · </span>${h}<span class="status-extra"> · próxima em ${S.contador}s</span>`;
  }

  function atualizar(manual) {
    S.contador = INTERVALO;
    S.ciclos++;
    carregarVista(false);
    if (manual) textoStatus();
  }

  function relogio() {
    setInterval(() => {
      if (document.hidden || !S.ufs.length) return;
      S.contador--;
      if (S.contador <= 0) atualizar();
      else textoStatus();
    }, 1000);
  }

  // ---------- Avisos / modo demonstração ----------
  function avisoFalha(erro) {
    const a = $('aviso');
    a.className = 'aviso';
    a.hidden = false;
    a.innerHTML = `<strong>Não foi possível acessar os dados do TSE.</strong>
      Pode ser que o navegador tenha bloqueado o acesso direto (CORS) ou que você esteja sem internet.
      Para contornar, rode o servidor incluído no projeto: <code>node servidor.mjs</code> e abra <code>http://localhost:8080</code>.
      <br><button type="button" id="btn-tentar">Tentar novamente</button><button type="button" id="btn-demo">Ver demonstração (dados fictícios)</button>`;
    $('btn-tentar').onclick = () => { a.hidden = true; iniciar(); };
    $('btn-demo').onclick = () => { TSE.ativarDemo(true); iniciar(); };
    $('status-ponto').className = 'status-ponto erro';
    $('status-texto').textContent = 'Sem conexão com o TSE';
    console.warn(erro);
  }
  function avisoDemo() {
    const a = $('aviso');
    a.className = 'aviso demo';
    a.hidden = false;
    a.innerHTML = `⚠️ SIMULAÇÃO — os números abaixo são fictícios, gerados apenas para demonstrar o funcionamento do site. Não são resultados reais.
      <br><button type="button" id="btn-real">Voltar para os dados do TSE</button>`;
    $('btn-real').onclick = () => { TSE.ativarDemo(false); a.hidden = true; iniciar(); };
  }

  async function iniciar() {
    S.porUF = {}; S.porMu = {}; S.porZona = {}; S.atual = null; S.fotos = {};
    S.muCarregado = new Set(); S.muEmCurso = new Set();
    $('status-texto').textContent = TSE.info.demo ? 'Iniciando simulação…' : 'Conectando ao TSE…';
    try {
      await TSE.iniciar();
      S.ufs = await TSE.configuracao();
      if (!S.ufs.length) throw new Error('Configuração vazia');
    } catch (e) {
      avisoFalha(e);
      return;
    }
    $('turno-label').textContent = TSE.info.turno === 1 ? '1º turno' : '2º turno';
    if (TSE.info.demo) avisoDemo();
    preencherEstados();
    montarPaises();
    preencherPaises();
    S.contador = INTERVALO;
    S.mapaMunUF = null;
    $('mapa').innerHTML = '';
    aplicarRota();
  }

  // Escalas da legenda
  for (const [id, p] of [['escala-lula', 'l'], ['escala-flavio', 'f']]) {
    $(id).innerHTML = [1, 2, 3, 4].map(i => `<i style="background:var(--${p}${i})"></i>`).join('');
  }
  ligarControles();
  relogio();
  iniciar();
})();
