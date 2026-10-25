# Apuração 2026 · Presidente (2º turno)

Site para acompanhar a apuração da eleição presidencial de 2026 — **Lula (PT, 13)** × **Flávio Bolsonaro (PL, 22)** —
com os dados oficiais publicados pelo TSE em
[resultados.tse.jus.br](https://resultados.tse.jus.br/oficial/app/index.html#/eleicao/6258/uf/br/cargo/1/vis/nominal/resultados).

Três abas:

- **Brasil** (página inicial): resultado geral, somando o Brasil inteiro e o exterior. Barra horizontal com
  Lula (vermelho) à esquerda e Flávio (azul) à direita, fotos com o percentual de cada um e o mapa do Brasil
  pintado pela cor de quem está à frente em cada estado.
- **Estados**: escolha o estado e, se quiser, o município e a zona eleitoral para ver os votos de cada um.
  O mapa mostra os municípios do estado (malha do IBGE) e a tabela lista municípios ou zonas.
- **Exterior**: abre direto na apuração total do exterior. Para ver um país, escolha-o no seletor
  (o total do país é a soma das suas cidades); depois dá para escolher a cidade e a zona. O TSE publica o
  exterior por cidade, e `js/exterior.js` diz a que país pertence cada cidade.

Funciona no celular (iPhone/iOS e Android) e no computador, com tema claro/escuro. Pode ser adicionado à tela
de início do celular como um aplicativo. Os dados se atualizam sozinhos a cada 30 segundos, e cada tela tem
link próprio (ex.: `#/uf/sp/mu/71072/zona/0001`).

## Como abrir

O site é estático (HTML, CSS e JavaScript, sem build). O jeito mais garantido é usar o servidor incluso,
que também funciona como proxy caso o navegador bloqueie o acesso direto ao TSE ou ao IBGE (CORS):

```bash
cd apuracao-eleicoes-2026
node servidor.mjs        # Node 18 ou superior, sem npm install
```

Acesse http://localhost:8080. Para outra porta: `PORT=3001 node servidor.mjs`.

O site também é publicado no **GitHub Pages** pelo workflow `.github/workflows/pages.yml` a cada push na
branch `main`. Nesse caso o navegador busca os arquivos diretamente no TSE.

Se não houver conexão com o TSE, o site oferece um **modo demonstração** com números fictícios (claramente
sinalizado como SIMULAÇÃO), útil só para ver o layout.

## Arquivos do TSE usados

Eleição `6258` (Presidente, 2º turno, 25/10/2026), ciclo `ele2026`:

| Dado | Caminho |
|---|---|
| Eleições/ciclos | `/oficial/comum/config/ele-c.json` |
| Estados, municípios e zonas | `/oficial/ele2026/6258/config/mun-e006258-cm.json` |
| Brasil | `/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json` |
| Estado (`zz` = exterior) | `/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json` |
| Município | `/oficial/ele2026/6258/dados/sp/sp71072-c0001-e006258-u.json` |
| Zona eleitoral | `/oficial/ele2026/6258/dados/sp/sp71072-z0001-c0001-e006258-u.json` |
| Foto do candidato | `/oficial/ele2026/6258/fotos/br/<sqcand>.jpeg` |

Para acompanhar outra eleição do mesmo ciclo, use `?e=` na URL (ex.: `?e=6257` para o 1º turno).

## Estrutura

```
index.html          página
manifest.webmanifest, icones/   instalação na tela de início (iPhone e Android)
css/style.css       visual (claro/escuro, responsivo)
js/tse.js           leitura e normalização dos arquivos do TSE e da malha do IBGE
js/app.js           interface: placar, mapa, tabela, navegação e atualização automática
js/demo.js          gerador de dados fictícios para o modo demonstração
js/mapa-brasil.js   contornos dos estados (@svg-maps/brazil, CC BY 4.0)
servidor.mjs        servidor estático + proxy opcional para TSE e IBGE
```

Site independente, sem vínculo com o TSE ou com as campanhas.
