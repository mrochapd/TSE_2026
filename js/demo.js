// Modo demonstração: gera dados FICTÍCIOS no mesmo formato dos arquivos do TSE,
// só para visualizar o layout quando o site não consegue acessar o TSE.
// A apuração simulada avança com o tempo (termina em poucos minutos).
(function () {
  // [sigla, nome, eleitorado (milhões), tendência Lula 0–1, capital]
  const UFS = [
    ['ac', 'ACRE', 0.6, 0.33, 'RIO BRANCO'], ['al', 'ALAGOAS', 2.3, 0.62, 'MACEIÓ'],
    ['ap', 'AMAPÁ', 0.55, 0.50, 'MACAPÁ'], ['am', 'AMAZONAS', 2.6, 0.52, 'MANAUS'],
    ['ba', 'BAHIA', 11.3, 0.71, 'SALVADOR'], ['ce', 'CEARÁ', 6.8, 0.68, 'FORTALEZA'],
    ['df', 'DISTRITO FEDERAL', 2.2, 0.41, 'BRASÍLIA'], ['es', 'ESPÍRITO SANTO', 2.9, 0.42, 'VITÓRIA'],
    ['go', 'GOIÁS', 4.9, 0.40, 'GOIÂNIA'], ['ma', 'MARANHÃO', 4.9, 0.70, 'SÃO LUÍS'],
    ['mt', 'MATO GROSSO', 2.5, 0.36, 'CUIABÁ'], ['ms', 'MATO GROSSO DO SUL', 2.0, 0.40, 'CAMPO GRANDE'],
    ['mg', 'MINAS GERAIS', 16.3, 0.50, 'BELO HORIZONTE'], ['pa', 'PARÁ', 6.1, 0.56, 'BELÉM'],
    ['pb', 'PARAÍBA', 3.0, 0.66, 'JOÃO PESSOA'], ['pr', 'PARANÁ', 8.5, 0.38, 'CURITIBA'],
    ['pe', 'PERNAMBUCO', 7.0, 0.66, 'RECIFE'], ['pi', 'PIAUÍ', 2.6, 0.75, 'TERESINA'],
    ['rj', 'RIO DE JANEIRO', 12.8, 0.44, 'RIO DE JANEIRO'], ['rn', 'RIO GRANDE DO NORTE', 2.6, 0.64, 'NATAL'],
    ['rs', 'RIO GRANDE DO SUL', 8.6, 0.43, 'PORTO ALEGRE'], ['ro', 'RONDÔNIA', 1.2, 0.30, 'PORTO VELHO'],
    ['rr', 'RORAIMA', 0.37, 0.27, 'BOA VISTA'], ['sc', 'SANTA CATARINA', 5.6, 0.32, 'FLORIANÓPOLIS'],
    ['sp', 'SÃO PAULO', 34.7, 0.45, 'SÃO PAULO'], ['se', 'SERGIPE', 1.7, 0.63, 'ARACAJU'],
    ['to', 'TOCANTINS', 1.1, 0.51, 'PALMAS'], ['zz', 'EXTERIOR', 0.7, 0.55, null]
  ];
  const EXTERIOR = ['LISBOA', 'MIAMI', 'TÓQUIO', 'BOSTON', 'NAGÓIA', 'LONDRES', 'NOVA YORK', 'BUENOS AIRES', 'PARIS', 'MADRI', 'ASSUNÇÃO', 'TORONTO'];
  const DURACAO = 6 * 60 * 1000; // apuração simulada completa em ~6 min
  let inicio = Date.now();

  function semente(txt) {
    let h = 2166136261;
    for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h += 0x6D2B79F5; let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Estrutura: uf -> municípios -> zonas, cada zona com eleitorado e tendência próprios.
  const arvore = {};
  for (const [uf, nome, milhoes, tendencia, capital] of UFS) {
    const r = semente(uf);
    const nomes = uf === 'zz' ? EXTERIOR : [capital, 'CIDADE A (SIMULADA)', 'CIDADE B (SIMULADA)', 'CIDADE C (SIMULADA)', 'CIDADE D (SIMULADA)'];
    const pesos = nomes.map((_, i) => (i === 0 ? 3 : 1) * (0.6 + r()));
    const somaPesos = pesos.reduce((a, b) => a + b, 0);
    const mu = nomes.map((nm, i) => {
      const cd = String(10000 + Math.floor(r() * 89999));
      const tendMu = Math.min(0.9, Math.max(0.1, tendencia + (r() - 0.5) * 0.22));
      const eleitMu = milhoes * 1e6 * pesos[i] / somaPesos;
      const nz = 3;
      const zonas = Array.from({ length: nz }, (_, z) => ({
        cd: String(z + 1 + Math.floor(r() * 30) * 10).padStart(4, '0'),
        te: Math.round(eleitMu / nz * (0.8 + r() * 0.4)),
        tend: Math.min(0.92, Math.max(0.08, tendMu + (r() - 0.5) * 0.16)),
        comp: 0.76 + r() * 0.08,
        vel: 0.7 + r() * 0.6,
        atraso: r() * 0.25
      }));
      return { cd, cdi: null, nm, c: i === 0 && uf !== 'zz' ? 'S' : 'N', zonas };
    });
    arvore[uf] = { cd: uf.toUpperCase(), ds: nome, mu };
  }

  function apurarZona(z) {
    const t = (Date.now() - inicio) / DURACAO;
    const p = Math.min(1, Math.max(0, (t - z.atraso) * z.vel * 1.4));
    const ts = Math.max(1, Math.round(z.te / 330));
    const st = p >= 1 ? ts : Math.floor(ts * p);
    const frac = st / ts;
    const c = Math.round(z.te * z.comp * frac);
    const vb = Math.round(c * 0.016), tvn = Math.round(c * 0.034);
    const vv = c - vb - tvn;
    const lula = Math.round(vv * z.tend);
    return { ts, st, te: z.te, esa: Math.round(z.te * frac), c, vb, tvn, vv, lula, flavio: vv - lula };
  }

  function somar(lista) {
    const t = { ts: 0, st: 0, te: 0, esa: 0, c: 0, vb: 0, tvn: 0, vv: 0, lula: 0, flavio: 0 };
    for (const x of lista) for (const k in t) t[k] += x[k];
    return t;
  }

  function formatoTSE(t) {
    const agora = new Date();
    const pad = n => String(n).padStart(2, '0');
    const virg = x => x.toFixed(2).replace('.', ',');
    return {
      dg: `${pad(agora.getDate())}/${pad(agora.getMonth() + 1)}/${agora.getFullYear()}`,
      hg: `${pad(agora.getHours())}:${pad(agora.getMinutes())}:${pad(agora.getSeconds())}`,
      s: { ts: String(t.ts), st: String(t.st), pst: virg(t.ts ? t.st / t.ts * 100 : 0) },
      e: { te: String(t.te), c: String(t.c), a: String(Math.max(0, t.esa - t.c)) },
      v: { vv: String(t.vv), vb: String(t.vb), tvn: String(t.tvn) },
      carg: [{ agr: [
        { par: [{ cand: [{ n: '13', nm: 'LULA', sqcand: null, vap: String(t.lula) }] }] },
        { par: [{ cand: [{ n: '22', nm: 'FLÁVIO BOLSONARO', sqcand: null, vap: String(t.flavio) }] }] }
      ] }]
    };
  }

  window.DEMO = {
    reiniciar() { inicio = Date.now(); },
    config() {
      return {
        abr: Object.values(arvore).map(u => ({
          cd: u.cd, ds: u.ds,
          mu: u.mu.map(m => ({ cd: m.cd, cdi: m.cdi, nm: m.nm, c: m.c, z: m.zonas.map(z => z.cd) }))
        }))
      };
    },
    resultado(uf, mu, zona) {
      let zonas;
      // O total do Brasil inclui os votos do exterior, como no TSE.
      if (!uf || uf === 'br') zonas = Object.values(arvore).flatMap(u => u.mu.flatMap(m => m.zonas));
      else {
        const u = arvore[uf];
        if (!u) throw Object.assign(new Error('HTTP 404'), { status: 404 });
        const ms = mu ? u.mu.filter(m => m.cd === mu) : u.mu;
        zonas = ms.flatMap(m => m.zonas).filter(z => !zona || z.cd === zona);
      }
      return formatoTSE(somar(zonas.map(apurarZona)));
    }
  };
})();
