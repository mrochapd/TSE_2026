// O TSE organiza os votos do exterior por cidade (abrangência ZZ). Esta tabela diz em que país fica
// cada cidade com seção eleitoral brasileira, para o site agrupar os resultados por país.
// Cidades que não estiverem aqui aparecem em "Outros países" (e continuam disponíveis na busca).
(function () {
  const PAISES = {
    'Estados Unidos': ['NOVA YORK', 'NOVA IORQUE', 'NEW YORK', 'BOSTON', 'MIAMI', 'ORLANDO', 'WASHINGTON', 'ATLANTA',
      'CHICAGO', 'HOUSTON', 'LOS ANGELES', 'SAO FRANCISCO', 'SAN FRANCISCO', 'HARTFORD', 'NEWARK', 'NOVA JERSEY',
      'FILADELFIA', 'PHILADELPHIA', 'SEATTLE', 'DALLAS', 'DENVER', 'LAS VEGAS', 'SAN DIEGO', 'TAMPA',
      'FORT LAUDERDALE', 'PHOENIX', 'SALT LAKE CITY', 'CHARLOTTE', 'HONOLULU', 'FRAMINGHAM', 'POMPANO BEACH'],
    'Canadá': ['TORONTO', 'MONTREAL', 'VANCOUVER', 'OTTAWA', 'OTAVA', 'CALGARY'],
    'México': ['CIDADE DO MEXICO', 'MEXICO', 'GUADALAJARA', 'CANCUN'],
    'Portugal': ['LISBOA', 'PORTO', 'FARO', 'COIMBRA', 'BRAGA', 'FUNCHAL', 'PONTA DELGADA'],
    'Espanha': ['MADRI', 'MADRID', 'BARCELONA', 'SEVILHA', 'PALMA DE MAIORCA', 'MALAGA', 'BILBAU', 'BILBAO'],
    'Reino Unido': ['LONDRES', 'EDIMBURGO', 'MANCHESTER'],
    'Irlanda': ['DUBLIN'],
    'França': ['PARIS', 'LYON', 'LIAO', 'MARSELHA', 'NICE'],
    'Guiana Francesa': ['CAIENA', 'SAINT-GEORGES', 'SAINT GEORGES', 'SAINT-GEORGES DE L\'OYAPOCK'],
    'Alemanha': ['BERLIM', 'FRANKFURT', 'MUNIQUE', 'HAMBURGO', 'COLONIA', 'STUTTGART', 'DUSSELDORF'],
    'Itália': ['ROMA', 'MILAO', 'NAPOLES', 'FLORENCA', 'TURIM', 'VENEZA'],
    'Suíça': ['GENEBRA', 'ZURIQUE', 'BERNA', 'BASILEIA', 'LAUSANNE', 'LAUSANA'],
    'Bélgica': ['BRUXELAS', 'ANTUERPIA'],
    'Países Baixos': ['AMSTERDA', 'AMSTERDAM', 'AMSTERDAO', 'HAIA', 'ROTERDA'],
    'Luxemburgo': ['LUXEMBURGO'],
    'Áustria': ['VIENA'],
    'Suécia': ['ESTOCOLMO'],
    'Noruega': ['OSLO'],
    'Dinamarca': ['COPENHAGUE'],
    'Finlândia': ['HELSINQUE'],
    'Islândia': ['REYKJAVIK', 'REIQUIAVIQUE'],
    'Polônia': ['VARSOVIA'],
    'República Tcheca': ['PRAGA'],
    'Hungria': ['BUDAPESTE'],
    'Romênia': ['BUCARESTE'],
    'Bulgária': ['SOFIA'],
    'Grécia': ['ATENAS'],
    'Croácia': ['ZAGREB', 'ZAGREBE'],
    'Eslovênia': ['LIUBLIANA'],
    'Eslováquia': ['BRATISLAVA'],
    'Sérvia': ['BELGRADO'],
    'Ucrânia': ['KIEV', 'KIIV', 'KYIV'],
    'Rússia': ['MOSCOU', 'SAO PETERSBURGO'],
    'Turquia': ['ANCARA', 'ISTAMBUL'],
    'Chipre': ['NICOSIA'],
    'Malta': ['VALLETTA', 'VALETA'],
    'Estônia': ['TALLINN', 'TALIN'],
    'Letônia': ['RIGA'],
    'Lituânia': ['VILNIUS'],
    'Armênia': ['EREVAN', 'IEREVAN', 'YEREVAN'],
    'Azerbaijão': ['BAKU'],
    'Geórgia': ['TBILISI', 'TIFLIS'],
    'Cazaquistão': ['ASTANA', 'NUR-SULTAN'],
    'Israel': ['TEL AVIV', 'TEL-AVIV'],
    'Palestina': ['RAMALLAH', 'RAMALA'],
    'Líbano': ['BEIRUTE'],
    'Jordânia': ['AMA', 'AMAN'],
    'Síria': ['DAMASCO'],
    'Egito': ['CAIRO'],
    'Emirados Árabes Unidos': ['DUBAI', 'ABU DHABI', 'ABU DABI'],
    'Catar': ['DOHA'],
    'Kuwait': ['KUWAIT', 'CIDADE DO KUWAIT', 'KUAITE'],
    'Arábia Saudita': ['RIADE', 'JIDA', 'JEDA'],
    'Omã': ['MASCATE'],
    'Bahrein': ['MANAMA'],
    'Irã': ['TEERA'],
    'Iraque': ['BAGDA'],
    'Japão': ['TOQUIO', 'NAGOYA', 'NAGOIA', 'HAMAMATSU', 'OTA', 'OIZUMI', 'KOBE', 'OSAKA', 'SUZUKA', 'TOYOTA',
      'TOYOHASHI', 'GUNMA', 'SHIZUOKA', 'AICHI', 'MIE', 'GIFU', 'YOKOHAMA', 'KOSAI', 'IWATA', 'TOKYO'],
    'China': ['PEQUIM', 'XANGAI', 'CANTAO', 'GUANGZHOU', 'HONG KONG', 'MACAU'],
    'Coreia do Sul': ['SEUL'],
    'Taiwan': ['TAIPE', 'TAIPEI'],
    'Índia': ['NOVA DELHI', 'MUMBAI', 'BOMBAIM'],
    'Indonésia': ['JACARTA'],
    'Tailândia': ['BANGKOK', 'BANGCOC', 'BANCOQUE'],
    'Vietnã': ['HANOI', 'HANOI'],
    'Filipinas': ['MANILA'],
    'Malásia': ['KUALA LUMPUR'],
    'Singapura': ['SINGAPURA', 'CINGAPURA'],
    'Austrália': ['SYDNEY', 'SIDNEY', 'CAMBERRA', 'CANBERRA', 'MELBOURNE', 'BRISBANE', 'PERTH'],
    'Nova Zelândia': ['WELLINGTON', 'AUCKLAND'],
    'Paquistão': ['ISLAMABAD', 'ISLAMABADE'],
    'Bangladesh': ['DACA'],
    'Sri Lanka': ['COLOMBO'],
    'Angola': ['LUANDA'],
    'Moçambique': ['MAPUTO'],
    'África do Sul': ['PRETORIA', 'CIDADE DO CABO', 'JOANESBURGO'],
    'Cabo Verde': ['PRAIA'],
    'Guiné-Bissau': ['BISSAU'],
    'São Tomé e Príncipe': ['SAO TOME'],
    'Nigéria': ['ABUJA', 'LAGOS'],
    'Gana': ['ACRA', 'ACCRA'],
    'Senegal': ['DACAR'],
    'Marrocos': ['RABAT', 'RABATE'],
    'Argélia': ['ARGEL'],
    'Tunísia': ['TUNIS'],
    'Quênia': ['NAIROBI'],
    'Etiópia': ['ADIS ABEBA', 'ADIS-ABEBA'],
    'Costa do Marfim': ['ABIDJAN', 'ABIDJÃ'],
    'Camarões': ['IAUNDE'],
    'Tanzânia': ['DAR ES SALAAM', 'DAR-ES-SALAAM'],
    'Namíbia': ['WINDHOEK'],
    'Zimbábue': ['HARARE'],
    'Líbia': ['TRIPOLI'],
    'Sudão': ['CARTUM'],
    'Guiné Equatorial': ['MALABO'],
    'Congo': ['BRAZZAVILLE'],
    'República Democrática do Congo': ['KINSHASA', 'QUINXASA'],
    'Gabão': ['LIBREVILLE'],
    'Benin': ['COTONOU'],
    'Togo': ['LOME'],
    'Zâmbia': ['LUSACA', 'LUSAKA'],
    'Botsuana': ['GABORONE'],
    'Argentina': ['BUENOS AIRES', 'CORDOBA', 'MENDOZA', 'ROSARIO', 'PASO DE LOS LIBRES', 'PUERTO IGUAZU', 'BARILOCHE'],
    'Uruguai': ['MONTEVIDEU', 'MONTEVIDEO', 'RIVERA', 'CHUY', 'ARTIGAS', 'RIO BRANCO'],
    'Paraguai': ['ASSUNCAO', 'ASUNCION', 'CIUDAD DEL ESTE', 'PEDRO JUAN CABALLERO', 'ENCARNACION', 'SALTO DEL GUAIRA', 'CONCEPCION'],
    'Bolívia': ['LA PAZ', 'SANTA CRUZ DE LA SIERRA', 'COCHABAMBA', 'COBIJA', 'GUAYARAMERIN', 'GUAJARA-MIRIM', 'PUERTO SUAREZ', 'RIBERALTA'],
    'Chile': ['SANTIAGO', 'SANTIAGO DO CHILE'],
    'Peru': ['LIMA', 'IQUITOS'],
    'Colômbia': ['BOGOTA', 'LETICIA'],
    'Venezuela': ['CARACAS', 'SANTA ELENA DE UAIREN', 'CIUDAD GUAYANA', 'PUERTO AYACUCHO'],
    'Equador': ['QUITO', 'GUAIAQUIL', 'GUAYAQUIL'],
    'Guiana': ['GEORGETOWN', 'LETHEM'],
    'Suriname': ['PARAMARIBO'],
    'Cuba': ['HAVANA'],
    'República Dominicana': ['SANTO DOMINGO', 'SAO DOMINGOS'],
    'Haiti': ['PORTO PRINCIPE'],
    'Jamaica': ['KINGSTON'],
    'Panamá': ['PANAMA', 'CIDADE DO PANAMA'],
    'Costa Rica': ['SAO JOSE', 'SAN JOSE'],
    'Guatemala': ['CIDADE DA GUATEMALA', 'GUATEMALA'],
    'Honduras': ['TEGUCIGALPA'],
    'El Salvador': ['SAN SALVADOR', 'SAO SALVADOR'],
    'Nicarágua': ['MANAGUA'],
    'Trinidad e Tobago': ['PORTO DE ESPANHA', 'PORT OF SPAIN'],
    'Barbados': ['BRIDGETOWN'],
    'Bahamas': ['NASSAU']
  };

  const normalizar = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
  const porCidade = {}, porNomePais = {};
  for (const [pais, cidades] of Object.entries(PAISES)) {
    porNomePais[normalizar(pais)] = pais;
    for (const c of cidades) porCidade[normalizar(c)] = pais;
  }
  // Nomes de país que o TSE pode usar e diferem dos daqui.
  Object.assign(porNomePais, { EUA: 'Estados Unidos', 'ESTADOS UNIDOS DA AMERICA': 'Estados Unidos', HOLANDA: 'Países Baixos', 'INGLATERRA': 'Reino Unido', 'COREIA': 'Coreia do Sul', 'TCHEQUIA': 'República Tcheca' });

  const OUTROS = 'Outros países';

  // paisDaCidade("TÓQUIO") → "Japão"; também entende "CIDADE - PAÍS" e "CIDADE (PAÍS)".
  function paisDaCidade(nomeCidade, paisInformado) {
    if (paisInformado) {
      const p = porNomePais[normalizar(paisInformado)];
      return p || paisInformado;
    }
    const n = normalizar(nomeCidade);
    if (porCidade[n]) return porCidade[n];
    const partes = n.match(/^(.*?)\s*(?:-|–|\/|\()\s*([^()]*?)\)?$/);
    if (partes) {
      if (porNomePais[partes[2]]) return porNomePais[partes[2]];
      if (porCidade[partes[1]]) return porCidade[partes[1]];
    }
    return OUTROS;
  }

  const slug = t => normalizar(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  window.EXTERIOR = { paisDaCidade, slug, OUTROS };
})();
