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
    sel: { uf: null, mu: null, zona: null },
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
    muCarregado: new Set(), // UFs cujos municípios já foram baixados ao menos uma vez
    muEmCurso: new Set(),
    fotos: {}
  };

  // ---------- Utilidades de configuração ----------
  const ufCfg = uf => S.ufs.find(u => u.cd === uf) || null;
  const muCfg = (uf, mu) => { const u = ufCfg(uf); return u ? u.mu.find(m => m.cd === mu) || null : null; };
  const nomeUF = uf => (uf === 'zz' ? 'Exterior' : (ufCfg(uf) || {}).nome || uf.toUpperCase());

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
    const sel = { uf: null, mu: null, zona: null };
    let aba = 'br';
    if (p[0] === 'zz') { sel.uf = 'zz'; aba = 'zz'; p.shift(); }
    else if (p[0] === 'uf') { aba = 'uf'; if (p[1]) sel.uf = p[1].toLowerCase(); p.splice(0, 2); }
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] === 'mu') sel.mu = p[i + 1] || null;
      if (p[i] === 'zona') sel.zona = p[i + 1] || null;
    }
    // Ignora códigos que não existem na configuração.
    if (sel.uf && S.ufs.length && !ufCfg(sel.uf)) { sel.uf = null; sel.mu = null; }
    if (sel.mu && S.ufs.length && !muCfg(sel.uf, sel.mu)) sel.mu = null;
    if (!sel.mu) sel.zona = null;
    return { sel, aba };
  }
  function aplicarRota() {
    const { sel, aba } = lerRota();
    const mudouUF = sel.uf !== S.sel.uf;
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
    const { uf, mu, zona } = S.sel;
    document.querySelectorAll('.aba').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === S.aba)));
    const exterior = S.aba === 'zz';
    $('campo-uf').hidden = exterior || S.aba === 'br';
    $('campo-mu').hidden = S.aba === 'br';
    $('campo-zona').hidden = S.aba === 'br';
    $('filtros').hidden = S.aba === 'br';
    $('rotulo-mu').textContent = exterior ? 'Cidade no exterior' : 'Município';
    $('sel-uf').value = uf && uf !== 'zz' ? uf : '';

    const u = uf ? ufCfg(uf) : null;
    const busca = $('busca-mu');
    busca.disabled = !u;
    busca.placeholder = u ? (exterior ? 'Digite a cidade…' : 'Todos os municípios — digite para buscar') : 'Escolha um estado primeiro';
    $('lista-mu').innerHTML = u ? u.mu.map(m => `<option value="${esc(m.nome)}"></option>`).join('') : '';
    const m = mu ? muCfg(uf, mu) : null;
    busca.value = m ? m.nome : '';

    const sz = $('sel-zona');
    sz.disabled = !m || !m.zonas.length;
    sz.innerHTML = '<option value="">' + (m ? 'Todas as zonas' : 'Escolha um município') + '</option>' +
      (m ? m.zonas.map(z => `<option value="${z}">Zona ${z}</option>`).join('') : '');
    sz.value = zona || '';

    // Trilha
    const partes = [`<a href="#/br">Brasil</a>`];
    if (uf) partes.push(mu ? `<a href="${hashDe({ uf })}">${esc(nomeUF(uf))}</a>` : `<strong>${esc(nomeUF(uf))}</strong>`);
    if (m) partes.push(zona ? `<a href="${hashDe({ uf, mu })}">${esc(m.nome)}</a>` : `<strong>${esc(m.nome)}</strong>`);
    if (zona) partes.push(`<strong>Zona ${esc(zona)}</strong>`);
    if (!uf) partes[0] = '<strong>Brasil</strong>';
    $('trilha').innerHTML = partes.join('<span class="sep">›</span>');
  }

  function ligarControles() {
    document.querySelectorAll('.aba').forEach(b => b.addEventListener('click', () => {
      const aba = b.dataset.aba;
      if (aba === 'br') irPara({ uf: null }, 'br');
      else if (aba === 'zz') irPara({ uf: 'zz' }, 'zz');
      else {
        irPara({ uf: S.sel.uf && S.sel.uf !== 'zz' ? S.sel.uf : null }, 'uf');
        if (!S.sel.uf || S.sel.uf === 'zz') setTimeout(() => $('sel-uf').focus(), 50);
      }
    }));
    $('sel-uf').addEventListener('change', e => irPara({ uf: e.target.value || null }, 'uf'));
    const busca = $('busca-mu');
    const escolherMu = () => {
      const u = ufCfg(S.sel.uf); if (!u) return;
      const txt = busca.value.trim().toLowerCase();
      if (!txt) { if (S.sel.mu) irPara({ uf: S.sel.uf }); return; }
      const m = u.mu.find(x => x.nome.toLowerCase() === txt);
      if (m && m.cd !== S.sel.mu) irPara({ uf: S.sel.uf, mu: m.cd });
    };
    busca.addEventListener('input', () => { if (busca.value.trim() === '' || $('lista-mu').querySelector(`option[value="${CSS.escape(busca.value)}"]`)) escolherMu(); });
    busca.addEventListener('change', escolherMu);
    busca.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const u = ufCfg(S.sel.uf); if (!u) return;
      const txt = busca.value.trim().toLowerCase();
      const m = u.mu.find(x => x.nome.toLowerCase() === txt) || u.mu.find(x => x.nome.toLowerCase().startsWith(txt));
      if (m) irPara({ uf: S.sel.uf, mu: m.cd });
    });
    $('sel-zona').addEventListener('change', e => irPara({ uf: S.sel.uf, mu: S.sel.mu, zona: e.target.value || null }));
    $('btn-atualizar').addEventListener('click', () => atualizar(true));
    $('filtro-tabela').addEventListener('input', renderTabela);
    document.querySelectorAll('#tabela th[data-ord]').forEach(th => th.addEventListener('click', () => {
      const c = th.dataset.ord;
      S.ordem = { campo: c, dir: S.ordem.campo === c ? -S.ordem.dir : (c === 'nome' ? 1 : -1) };
      renderTabela();
    }));
    window.addEventListener('hashchange', aplicarRota);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.contador <= 5) atualizar(); });
  }

  // ---------- Placar ----------
  function tituloLocal() {
    const { uf, mu, zona } = S.sel;
    if (!uf) return 'Brasil';
    const m = mu ? muCfg(uf, mu) : null;
    const sufixo = uf === 'zz' ? 'Exterior' : uf.toUpperCase();
    if (zona && m) return `Zona ${zona} · ${m.nome} – ${sufixo}`;
    if (m) return `${m.nome} – ${sufixo}`;
    return uf === 'zz' ? 'Exterior' : `${nomeUF(uf)} (${sufixo})`;
  }

  function renderPlacar(r) {
    $('titulo-local').textContent = tituloLocal();
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
    if (!temVotos) { dv.textContent = r.semArquivo ? 'Aguardando dados do TSE' : 'Aguardando votos apurados'; dv.style.color = ''; }
    else if (!dif) { dv.textContent = 'Empate'; dv.style.color = ''; }
    else {
      const l = lula.votos > flavio.votos;
      dv.textContent = `${l ? 'Lula' : 'Flávio'} à frente por ${n(dif)} votos`;
      dv.style.color = l ? 'var(--lula)' : 'var(--flavio)';
    }

    $('pct-lula').textContent = pct(lula.pct);
    $('pct-flavio').textContent = pct(flavio.pct);
    $('votos-lula').textContent = n(lula.votos);
    $('votos-flavio').textContent = n(flavio.votos);

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
    $('hora-tse').textContent = r.atualizado ? 'gerado em ' + r.atualizado : (r.semArquivo ? 'arquivo ainda não publicado' : '—');
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
      <div class="rodape-dica">${r.soma ? n(r.lula.votos) + ' × ' + n(r.flavio.votos) + ' votos · ' : ''}${pct(r.secoes.pct)} apurado${extra ? ' · ' + esc(extra) : ''}</div>`;
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

  function ligarEventosMapa(svg, nomeDe, resultadoDe, destinoDe) {
    svg.addEventListener('mousemove', ev => {
      const p = ev.target.closest('path.regiao');
      if (!p) { esconderDica(); return; }
      mostrarDica(htmlDica(nomeDe(p), resultadoDe(p)), ev);
    });
    svg.addEventListener('mouseleave', esconderDica);
    svg.addEventListener('click', ev => {
      const p = ev.target.closest('path.regiao');
      if (!p) return;
      esconderDica();
      const destino = destinoDe(p);
      if (destino) irPara(destino);
    });
    svg.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const p = ev.target.closest('path.regiao');
      if (!p) return;
      ev.preventDefault();
      const destino = destinoDe(p);
      if (destino) irPara(destino);
    });
  }

  function desenharMapaBrasil() {
    const M = window.MAPA_BRASIL;
    const caixa = $('mapa');
    caixa.classList.remove('municipal');
    S.mapaMunUF = null;
    caixa.innerHTML = `<svg viewBox="${M.viewBox}" role="group" aria-label="Mapa do Brasil por estado">
      ${M.estados.map(e => `<path class="regiao" tabindex="0" data-uf="${e.id}" d="${e.d}" aria-label="${esc(e.nome)}"></path>`).join('')}
      <g class="rotulos"></g></svg>`;
    const svg = caixa.querySelector('svg');
    const g = svg.querySelector('.rotulos');
    svg.querySelectorAll('path').forEach(p => {
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
      p => ({ uf: p.dataset.uf }));
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

    caixa.classList.add('municipal');
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
    const lista = S.sel.uf ? Object.values(S.porMu[S.sel.uf] || {}) : S.ufs.filter(u => u.cd !== 'zz').map(u => S.porUF[u.cd]);
    const venc = { l: 0, f: 0 };
    lista.forEach(r => { const v = vencedor(r); if (v) venc[v]++; });
    const rotulo = S.sel.uf === 'zz' ? 'cidades' : S.sel.uf ? 'municípios' : 'estados';
    let html = `<div class="contagem">
      <div class="c-l"><strong>${venc.l}</strong><span>${rotulo} com Lula à frente</span></div>
      <div class="c-f"><strong>${venc.f}</strong><span>${rotulo} com Flávio à frente</span></div></div>`;
    if (!S.sel.uf && S.porUF.zz) {
      const z = S.porUF.zz;
      html += `<div class="mini-placar" role="button" tabindex="0" data-ir="zz" style="cursor:pointer">
        <h3>🌎 Exterior</h3>
        <div class="linha"><span style="color:var(--lula)">Lula</span><b>${pct(z.lula.pct)}</b></div>
        <div class="linha"><span style="color:var(--flavio)">Flávio</span><b>${pct(z.flavio.pct)}</b></div>
        <div class="linha" style="color:var(--texto-2);font-size:.78rem"><span>Apurado</span><b>${pct(z.secoes.pct)}</b></div></div>`;
    }
    if (S.sel.uf && S.sel.uf !== 'zz' && S.porUF[S.sel.uf]) {
      const r = S.porUF[S.sel.uf];
      html += `<div class="mini-placar"><h3>Total de ${esc(nomeUF(S.sel.uf))}</h3>
        <div class="linha"><span style="color:var(--lula)">Lula</span><b>${pct(r.lula.pct)}</b></div>
        <div class="linha"><span style="color:var(--flavio)">Flávio</span><b>${pct(r.flavio.pct)}</b></div></div>`;
    }
    const caixa = $('mapa-placar');
    caixa.innerHTML = html;
    const ir = caixa.querySelector('[data-ir]');
    if (ir) {
      ir.addEventListener('click', () => irPara({ uf: 'zz' }));
      ir.addEventListener('keydown', e => { if (e.key === 'Enter') irPara({ uf: 'zz' }); });
    }
  }

  function renderListaExterior() {
    const caixa = $('mapa');
    caixa.classList.remove('municipal');
    S.mapaMunUF = null;
    const dados = S.porMu.zz || {};
    const u = ufCfg('zz');
    const linhas = (u ? u.mu : []).map(m => ({ m, r: dados[m.cd] })).filter(x => x.r && x.r.soma)
      .sort((a, b) => b.r.soma - a.r.soma).slice(0, 12);
    caixa.innerHTML = `<div class="lista-exterior">
      <p class="sub" style="margin:0 0 6px">Cidades com mais votos apurados no exterior</p>
      ${linhas.length ? linhas.map(({ m, r }) => `
        <div class="mini-placar" role="button" tabindex="0" data-mu="${m.cd}" style="cursor:pointer">
          <div class="linha"><b>${esc(m.nome)}</b><span style="color:var(--texto-2);font-size:.8rem">${n(r.soma)} votos válidos</span></div>
          <div class="mini-barra" style="margin-top:6px"><i class="ml" style="width:${r.lula.pct}%"></i><i class="mf" style="width:${r.flavio.pct}%"></i></div>
          <div class="linha" style="margin-top:4px"><span style="color:var(--lula)">Lula ${pct(r.lula.pct)}</span><span style="color:var(--flavio)">Flávio ${pct(r.flavio.pct)}</span></div>
        </div>`).join('') : '<p class="sub">Ainda não há votos apurados no exterior.</p>'}
    </div>`;
    caixa.querySelectorAll('[data-mu]').forEach(el => {
      const ir = () => irPara({ uf: 'zz', mu: el.dataset.mu });
      el.addEventListener('click', ir);
      el.addEventListener('keydown', e => { if (e.key === 'Enter') ir(); });
    });
    renderPlacarMapa();
  }

  async function prepararMapa(geracao) {
    const uf = S.sel.uf;
    const aviso = $('mapa-carregando');
    if (!uf) {
      $('titulo-mapa').textContent = 'Onde cada candidato venceu';
      $('sub-mapa').textContent = 'Toque ou clique em um estado para ver os detalhes.';
      if (S.mapaMunUF || !$('mapa').querySelector('svg[aria-label^="Mapa do Brasil"]')) desenharMapaBrasil(); else pintarMapa();
      return;
    }
    if (uf === 'zz') {
      $('titulo-mapa').textContent = 'Votos no exterior';
      $('sub-mapa').textContent = 'Toque em uma cidade para ver o resultado dela.';
      aviso.hidden = true;
      renderListaExterior();
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
      if (S.mapaMunUF || !$('mapa').querySelector('svg')) desenharMapaBrasil(); else pintarMapa();
    }
  }

  // ---------- Tabela ----------
  function linhasTabela() {
    const { uf, mu } = S.sel;
    if (!uf) {
      const l = S.ufs.filter(u => u.cd !== 'zz').map(u => ({ chave: u.cd, nome: u.nome, sub: u.cd.toUpperCase(), r: S.porUF[u.cd], destino: { uf: u.cd } }));
      if (ufCfg('zz')) l.push({ chave: 'zz', nome: 'Exterior', sub: 'ZZ', r: S.porUF.zz, destino: { uf: 'zz' } });
      return l;
    }
    if (mu) {
      const m = muCfg(uf, mu);
      const dados = S.porZona[uf + mu] || {};
      return (m ? m.zonas : []).map(z => ({ chave: z, nome: 'Zona ' + z, sub: m.nome, r: dados[z], destino: { uf, mu, zona: z } }));
    }
    const u = ufCfg(uf);
    const dados = S.porMu[uf] || {};
    return (u ? u.mu : []).map(m => ({ chave: m.cd, nome: m.nome, sub: m.capital ? 'Capital' : '', r: dados[m.cd], destino: { uf, mu: m.cd } }));
  }

  function renderTabela() {
    const { uf, mu, zona } = S.sel;
    $('titulo-tabela').textContent = !uf ? 'Resultado por estado' : mu ? 'Resultado por zona eleitoral'
      : uf === 'zz' ? 'Resultado por cidade no exterior' : `Resultado por município · ${nomeUF(uf)}`;
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
        <td class="nome-local ${v ? 'vencedor-' + v : ''}">${esc(l.nome)}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</td>
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
    const lista = S.ufs.map(u => u.cd);
    await TSE.emLotes(lista, 6, async uf => {
      try {
        S.porUF[uf] = await TSE.resultado(uf);
        pintarMapa(); agendarTabela();
      } catch (e) { /* mantém o último valor conhecido */ }
    });
  }

  // Baixa os municípios da UF (ou as cidades do exterior). Continua mesmo se o usuário
  // navegar dentro da mesma UF; para se ele trocar de UF.
  async function carregarMunicipios(uf) {
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
        if (S.sel.uf !== uf) { abortado = true; return; }
        try { dados[m.cd] = await TSE.resultado(uf, m.cd); } catch (e) { /* tenta de novo na próxima rodada */ }
        feitos++;
        if (S.sel.uf !== uf) return;
        if (primeiraVez && pendentes.length > 20) {
          aviso.hidden = feitos >= pendentes.length;
          aviso.textContent = `Carregando ${uf === 'zz' ? 'cidades' : 'municípios'}: ${feitos} de ${pendentes.length}…`;
        }
        if (uf === 'zz') { if (feitos % 5 === 0 || feitos === pendentes.length) renderListaExterior(); }
        else pintarMapa();
        agendarTabela();
      });
    } finally {
      S.muEmCurso.delete(uf);
      if (!abortado) S.muCarregado.add(uf);
      if (S.sel.uf === uf || abortado) aviso.hidden = true;
    }
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
    const { uf, mu, zona } = S.sel;
    if (navegacao) {
      // Mostra imediatamente o que já está em memória.
      const cache = zona ? (S.porZona[uf + mu] || {})[zona] : mu ? (S.porMu[uf] || {})[mu] : uf ? S.porUF[uf] : S.atual && S.atual.br ? S.atual : null;
      renderPlacar(cache || vazioPlacar());
      renderTabela();
      prepararMapa(geracao);
    }
    girar(true);
    try {
      const r = await TSE.resultado(uf, mu, zona);
      if (geracao !== S.geracao) return;
      if (!uf) r.br = true;
      S.atual = r;
      if (zona) (S.porZona[uf + mu] || (S.porZona[uf + mu] = {}))[zona] = r;
      else if (mu) (S.porMu[uf] || (S.porMu[uf] = {}))[mu] = r;
      else if (uf) S.porUF[uf] = r;
      renderPlacar(r);
      status('vivo');

      const tarefas = [];
      // O mapa do Brasil precisa dos 27 estados + exterior; o placar do estado usa o total da UF.
      if (!uf || Object.keys(S.porUF).length < S.ufs.length || (!navegacao && S.ciclos % 2 === 0)) tarefas.push(carregarUFs());
      if (uf) {
        const recarregarTudo = !navegacao && S.ciclos % 3 === 0; // municípios: a cada ~90 s
        if (!S.muCarregado.has(uf) || recarregarTudo) tarefas.push(carregarMunicipios(uf));
      }
      if (uf && mu) tarefas.push(carregarZonas(uf, mu, geracao));
      await Promise.all(tarefas);
      if (geracao !== S.geracao) return;
      renderTabela();
      if (uf === 'zz') renderListaExterior(); else pintarMapa();
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
      texto.textContent = 'Falha ao atualizar — tentando de novo';
      console.warn('Erro ao carregar dados', erro);
    }
  }
  function textoStatus() {
    if (!ultimaHora) return;
    const h = ultimaHora.toLocaleTimeString('pt-BR');
    $('status-texto').textContent = `${TSE.info.demo ? 'Simulação' : 'Ao vivo'} · ${h} · próxima em ${S.contador}s`;
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
