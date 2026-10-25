// Camada de dados: lê os arquivos públicos de divulgação do TSE (resultados.tse.jus.br)
// e as malhas municipais do IBGE, e normaliza tudo num formato simples.
//
// Arquivos usados (eleição 6258 = Presidente, 2º turno de 2026):
//   /oficial/comum/config/ele-c.json                                  eleições e ciclos
//   /oficial/ele2026/6258/config/mun-e006258-cm.json                  estados, municípios e zonas
//   /oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json            Brasil
//   /oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json            estado (zz = exterior)
//   /oficial/ele2026/6258/dados/sp/sp71072-c0001-e006258-u.json       município
//   /oficial/ele2026/6258/dados/sp/sp71072-z0001-c0001-e006258-u.json zona eleitoral
//   /oficial/ele2026/6258/fotos/br/<sqcand>.jpeg                       foto do candidato
(function () {
  const HOST_TSE = 'https://resultados.tse.jus.br';
  const HOST_IBGE = 'https://servicodados.ibge.gov.br';
  const params = new URLSearchParams(location.search);
  const ELEICAO = (params.get('e') || '6258').replace(/\D/g, '') || '6258';
  const COD = 'e' + ELEICAO.padStart(6, '0');
  const CARGO = 'c0001';

  // Códigos IBGE das UFs (usados para pedir a malha municipal ao IBGE).
  const IBGE_UF = {
    ro: 11, ac: 12, am: 13, rr: 14, pa: 15, ap: 16, to: 17, ma: 21, pi: 22, ce: 23, rn: 24, pb: 25,
    pe: 26, al: 27, se: 28, ba: 29, mg: 31, es: 32, rj: 33, sp: 35, pr: 41, sc: 42, rs: 43, ms: 50,
    mt: 51, go: 52, df: 53
  };

  const info = { eleicao: ELEICAO, ciclo: params.get('ciclo') || 'ele2026', turno: ELEICAO === '6257' ? 1 : 2, modo: 'direto', demo: false };
  const malhas = new Map();

  function erroHTTP(status) { return Object.assign(new Error('HTTP ' + status), { status }); }

  async function baixarJSON(url) {
    // no-cache: o navegador revalida com ETag e o TSE responde 304 quando nada mudou.
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw erroHTTP(r.status);
    return r.json();
  }

  // Se o navegador bloquear o acesso direto (CORS/rede), usa o proxy do servidor.mjs (/tse/...).
  async function proxyDisponivel() {
    if (!location.protocol.startsWith('http')) return false;
    try { const r = await fetch('proxy-ok', { cache: 'no-store' }); return r.ok && (await r.json()).ok === true; }
    catch (e) { return false; }
  }

  async function pegar(host, prefixoProxy, caminho) {
    if (info.modo === 'proxy') return baixarJSON(prefixoProxy + caminho);
    return baixarJSON(host + caminho);
  }
  const pegarTSE = caminho => pegar(HOST_TSE, 'tse', caminho);
  const pegarIBGE = caminho => pegar(HOST_IBGE, 'ibge', caminho);

  // ---------- utilidades ----------
  function num(v) {
    if (v == null || v === '' || typeof v === 'object') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).trim();
    const x = s.includes(',') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s);
    return Number.isFinite(x) ? x : null;
  }
  const primeiro = (...vs) => { for (const v of vs) if (v != null) return v; return null; };
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'del', 'la', 'di']);
  function titulo(txt) {
    if (!txt) return '';
    return String(txt).toLowerCase().split(/(\s+|-|')/).map((p, i) => {
      if (!p.trim() || p === '-' || p === "'") return p;
      if (i > 0 && MINUSCULAS.has(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join('').replace(/\(([a-z])/g, (m, c) => '(' + c.toUpperCase());
  }

  async function emLotes(itens, limite, fn) {
    let i = 0;
    const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, async () => {
      while (i < itens.length) { const idx = i++; await fn(itens[idx], idx); }
    });
    await Promise.all(trabalhadores);
  }

  // Encontra o ciclo (ex.: "ele2026") e o turno da eleição dentro do ele-c.json.
  function acharEleicao(o, ciclo) {
    if (!o || typeof o !== 'object') return null;
    if (Array.isArray(o)) { for (const x of o) { const r = acharEleicao(x, ciclo); if (r) return r; } return null; }
    if (typeof o.c === 'string' && /^ele\d{4}$/.test(o.c)) ciclo = o.c;
    if (String(o.cd) === ELEICAO && ciclo) return { ciclo, turno: num(o.t) };
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') { const r = acharEleicao(v, ciclo); if (r) return r; }
    }
    return null;
  }

  // ---------- normalização ----------
  function acharCandidatos(o, saida) {
    if (!o || typeof o !== 'object') return saida;
    if (Array.isArray(o)) { o.forEach(x => acharCandidatos(x, saida)); return saida; }
    for (const [k, v] of Object.entries(o)) {
      if (k === 'cand' && Array.isArray(v)) v.forEach(c => { if (c && c.n != null) saida.push(c); });
      else if (v && typeof v === 'object') acharCandidatos(v, saida);
    }
    return saida;
  }

  function normalizar(d) {
    d = obj(d);
    const raiz = Array.isArray(d.carg) && d.carg.length ? d.carg[0] : d;
    const cands = acharCandidatos(raiz, []);
    const porNumero = n => cands.find(c => String(c.n).replace(/^0+/, '') === n) || null;
    const cl = porNumero('13'), cf = porNumero('22');
    const s = obj(d.s), e = obj(d.e), v = obj(d.v);

    const ts = primeiro(num(s.ts), num(d.s));
    const st = primeiro(num(s.st), num(d.st));
    const pst = primeiro(num(s.pst), num(d.pst), ts ? (st || 0) / ts * 100 : null);
    const lv = num(cl && cl.vap) || 0, fv = num(cf && cf.vap) || 0;
    const soma = lv + fv;
    const eleito = c => !!c && (c.e === 's' || c.e === 'S' || /^eleito/i.test(c.st || '') || /^eleito/i.test(c.dvt || ''));
    const cand = (c, votos, nome) => ({
      votos, pct: soma ? votos / soma * 100 : 0, nome: (c && (c.nmu || c.nm)) || nome,
      sqcand: c && c.sqcand ? String(c.sqcand) : null, eleito: eleito(c)
    });

    return {
      lula: cand(cl, lv, 'LULA'),
      flavio: cand(cf, fv, 'FLÁVIO BOLSONARO'),
      soma,
      secoes: { total: ts, apuradas: st, pct: pst || 0 },
      eleitorado: primeiro(num(e.te), num(d.e)),
      comparecimento: primeiro(num(e.c), num(d.c)),
      abstencao: primeiro(num(e.a), num(d.a)),
      validos: primeiro(num(v.vv), num(d.vv), soma || null),
      brancos: primeiro(num(v.vb), num(d.vb)),
      nulos: primeiro(num(v.tvn), num(d.tvn), num(d.vn)),
      atualizado: [d.dg || d.dt, d.hg || d.ht].filter(Boolean).join(' ') || null
    };
  }

  function vazio() { return normalizar({}); }

  function normalizarConfig(cfg) {
    let abr = obj(cfg).abr;
    if (!Array.isArray(abr)) abr = [];
    return abr.map(u => ({
      cd: String(u.cd || '').toLowerCase(),
      nome: titulo(u.ds || u.nm || u.cd),
      mu: (Array.isArray(u.mu) ? u.mu : []).map(m => ({
        cd: String(m.cd), cdi: m.cdi ? String(m.cdi) : null, nome: titulo(m.nm || m.cd),
        capital: m.c === 'S', zonas: (Array.isArray(m.z) ? m.z : []).map(z => String(z).padStart(4, '0'))
      })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    })).filter(u => u.cd);
  }

  // ---------- API pública ----------
  const TSE = {
    info,
    titulo,
    emLotes,
    IBGE_UF,

    async iniciar() {
      if (info.demo) return;
      try {
        await pegarTSE('/oficial/comum/config/ele-c.json').then(cfg => {
          const achado = acharEleicao(cfg, null);
          if (achado) { info.ciclo = achado.ciclo; if (achado.turno) info.turno = achado.turno; }
        });
      } catch (e) {
        if (e.status) return; // o TSE respondeu: o acesso direto funciona
        if (await proxyDisponivel()) { info.modo = 'proxy'; return TSE.iniciar(); }
        throw e;
      }
    },

    async configuracao() {
      if (info.demo) return normalizarConfig(window.DEMO.config());
      const cfg = await pegarTSE(`/oficial/${info.ciclo}/${ELEICAO}/config/mun-${COD}-cm.json`);
      return normalizarConfig(cfg);
    },

    // uf: null (Brasil) | 'sp' | 'zz'; mu: código TSE do município; zona: '0001'
    async resultado(uf, mu, zona) {
      if (info.demo) return normalizar(window.DEMO.resultado(uf, mu, zona));
      const u = uf || 'br';
      let arq = u + (mu || '');
      if (mu && zona) arq += '-z' + zona;
      try {
        return normalizar(await pegarTSE(`/oficial/${info.ciclo}/${ELEICAO}/dados/${u}/${arq}-${CARGO}-${COD}-u.json`));
      } catch (e) {
        if (e.status === 404 || e.status === 403) return Object.assign(vazio(), { semArquivo: true });
        throw e;
      }
    },

    foto(sqcand) {
      if (!sqcand || info.demo) return null;
      const caminho = `/oficial/${info.ciclo}/${ELEICAO}/fotos/br/${sqcand}.jpeg`;
      return (info.modo === 'proxy' ? 'tse' : HOST_TSE) + caminho;
    },

    // GeoJSON dos municípios de uma UF (propriedade "codarea" = código IBGE de 7 dígitos).
    async malhaMunicipios(uf) {
      const cod = IBGE_UF[uf];
      if (!cod) return null;
      if (!malhas.has(uf)) {
        const caminho = `/api/v3/malhas/estados/${cod}?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio`;
        const p = pegarIBGE(caminho)
          .catch(async e => {
            // O TSE pode aceitar acesso direto e o IBGE não: tenta o proxy só para a malha.
            if (!e.status && info.modo === 'direto' && await proxyDisponivel()) return baixarJSON('ibge' + caminho);
            throw e;
          })
          .catch(e => { malhas.delete(uf); throw e; });
        malhas.set(uf, p);
      }
      return malhas.get(uf);
    },

    ativarDemo(ativo) {
      info.demo = ativo;
      if (ativo && window.DEMO) window.DEMO.reiniciar();
    }
  };

  window.TSE = TSE;
})();
