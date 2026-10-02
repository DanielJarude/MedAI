// Banco inicial de questões (seed de produção). Conteúdo PROVISÓRIO: questões autorais com redação
// assistida por IA, sem revisão médica humana registrada. Não são questões de prova e não são atribuídas
// a nenhuma banca ou instituição. Gravadas na tabela questions com proveniência (validation_status PROVISIONAL).
// Para promover uma questão a MEDICALLY_REVIEWED é preciso registrar uma revisão humana real (ver BACKEND.md).
export const INITIAL_BANK_VERSION = 1;
export const INITIAL_QUESTIONS = [
  {
    "id": "has-01",
    "subtopic": "Hipertensão arterial",
    "title": "Reconhecer o critério diagnóstico",
    "stem": "Em um caso didático, um adulto apresenta pressão arterial de 148/94 mmHg e 146/92 mmHg, aferida adequadamente em dois dias distintos. Segundo o critério geral apresentado pela OMS, qual interpretação é compatível com esses registros?",
    "options": [
      "Os registros são compatíveis com hipertensão arterial.",
      "A ausência de sintomas exclui hipertensão.",
      "Somente a pressão diastólica deve ser considerada.",
      "Uma pressão sistólica abaixo de 160 mmHg exclui hipertensão."
    ],
    "correct": 0,
    "explain": "A OMS descreve como critério geral valores sistólicos ≥ 140 mmHg e/ou diastólicos ≥ 90 mmHg em dois dias distintos. O caso atende a esse critério.",
    "analysis": [
      "As duas aferições ultrapassam os limites descritos.",
      "Hipertensão pode ocorrer sem sintomas.",
      "Os dois componentes da pressão importam.",
      "160 mmHg não é o limite diagnóstico utilizado neste exemplo."
    ],
    "key": "Compare os valores e a repetição das medidas, sem depender de sintomas.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [
        {
          "label": "OMS · Hypertension (fact sheet)",
          "url": "https://www.who.int/news-room/fact-sheets/detail/hypertension"
        }
      ],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "has-02",
    "subtopic": "Hipertensão arterial",
    "title": "Interpretar os componentes da pressão",
    "stem": "Em uma questão de fisiologia, o valor sistólico de uma medida de pressão arterial corresponde a qual momento?",
    "options": [
      "Ao relaxamento do coração entre os batimentos.",
      "À contração do coração.",
      "À concentração de oxigênio no sangue.",
      "À frequência cardíaca em repouso."
    ],
    "correct": 1,
    "explain": "A pressão sistólica corresponde à pressão durante a contração cardíaca; a diastólica, ao relaxamento entre os batimentos.",
    "analysis": [
      "Esse momento corresponde à pressão diastólica.",
      "Correto: a contração corresponde à sístole.",
      "Saturação de oxigênio é outra medida.",
      "Frequência e pressão são grandezas diferentes."
    ],
    "key": "Sístole: contração. Diástole: relaxamento.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [
        {
          "label": "OMS · Hypertension (fact sheet)",
          "url": "https://www.who.int/news-room/fact-sheets/detail/hypertension"
        }
      ],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "has-03",
    "subtopic": "Hipertensão arterial",
    "title": "Identificar fatores modificáveis",
    "stem": "Qual alternativa apresenta um fator de risco modificável para hipertensão arterial?",
    "options": [
      "Idade.",
      "História familiar.",
      "Consumo excessivo de sal.",
      "Predisposição genética."
    ],
    "correct": 2,
    "explain": "O consumo excessivo de sal é um fator modificável. Idade e predisposição familiar não são modificáveis por hábitos.",
    "analysis": [
      "A idade não é modificável.",
      "A história familiar não pode ser alterada.",
      "A alimentação é passível de mudança.",
      "A predisposição genética não é um hábito modificável."
    ],
    "key": "Separe características pessoais de exposições e hábitos modificáveis.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [
        {
          "label": "OMS · Hypertension (fact sheet)",
          "url": "https://www.who.int/news-room/fact-sheets/detail/hypertension"
        }
      ],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "ic-01",
    "subtopic": "Insuficiência cardíaca",
    "title": "Tratamento que modifica prognóstico",
    "stem": "Em um caso didático de insuficiência cardíaca com fração de ejeção reduzida, qual classe de medicamentos faz parte do tratamento associado à redução de mortalidade?",
    "options": [
      "Bloqueadores de canais de cálcio não di-hidropiridínicos, como verapamil.",
      "Anti-inflamatórios não esteroidais.",
      "Betabloqueadores com evidência na IC, como carvedilol ou bisoprolol.",
      "Antiarrítmicos de classe IC, como flecainida."
    ],
    "correct": 2,
    "explain": "Betabloqueadores com evidência (carvedilol, bisoprolol, succinato de metoprolol) integram o tratamento que reduz mortalidade na IC com fração de ejeção reduzida, ao lado de outras classes como inibidores do sistema renina-angiotensina, antagonistas mineralocorticoides e iSGLT2.",
    "analysis": [
      "Verapamil e diltiazem têm efeito inotrópico negativo e devem ser evitados na IC com fração de ejeção reduzida.",
      "AINEs favorecem retenção de sódio e descompensação.",
      "Correto: é uma das classes que modificam prognóstico.",
      "Flecainida está associada a maior mortalidade em cardiopatia estrutural."
    ],
    "key": "Diferencie medicamentos que aliviam sintomas daqueles que modificam prognóstico.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "ic-02",
    "subtopic": "Insuficiência cardíaca",
    "title": "Reconhecer congestão pulmonar",
    "stem": "Qual sintoma é característico de congestão pulmonar na insuficiência cardíaca esquerda?",
    "options": [
      "Edema de membros inferiores isolado, sem dispneia.",
      "Ortopneia: falta de ar ao deitar, aliviada ao elevar a cabeceira.",
      "Icterícia.",
      "Prurido generalizado."
    ],
    "correct": 1,
    "explain": "Na falência ventricular esquerda, a congestão se manifesta no pulmão: dispneia aos esforços, ortopneia e dispneia paroxística noturna.",
    "analysis": [
      "Edema periférico reflete principalmente congestão sistêmica, mais ligada ao lado direito.",
      "Correto: ortopneia é típica da congestão pulmonar.",
      "Icterícia não é manifestação típica de congestão pulmonar.",
      "Prurido não é um sinal de congestão."
    ],
    "key": "Congestão esquerda → pulmão. Congestão direita → sistema venoso (edema, hepatomegalia, turgência jugular).",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "sca-01",
    "subtopic": "Síndrome coronariana aguda",
    "title": "Primeiro exame na dor torácica",
    "stem": "Um paciente chega ao pronto-socorro com dor torácica sugestiva de síndrome coronariana aguda. Qual exame deve ser realizado e interpretado precocemente, idealmente em até 10 minutos da chegada?",
    "options": [
      "Teste ergométrico.",
      "Cintilografia miocárdica.",
      "Ecocardiograma transesofágico.",
      "Eletrocardiograma de 12 derivações."
    ],
    "correct": 3,
    "explain": "O eletrocardiograma de 12 derivações deve ser obtido e interpretado em até 10 minutos, pois identifica o supradesnivelamento do ST e orienta a reperfusão.",
    "analysis": [
      "Teste ergométrico não é exame inicial na suspeita de síndrome coronariana aguda em curso.",
      "Cintilografia não é o exame inicial na emergência.",
      "Não é exame de triagem inicial.",
      "Correto: ECG precoce é a prioridade diagnóstica."
    ],
    "key": "Dor torácica suspeita: ECG em até 10 minutos.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "sca-02",
    "subtopic": "Síndrome coronariana aguda",
    "title": "Objetivo no IAM com supra de ST",
    "stem": "No infarto agudo do miocárdio com supradesnivelamento do segmento ST, qual é o objetivo terapêutico central nas primeiras horas?",
    "options": [
      "Aguardar a curva de troponina antes de qualquer conduta.",
      "Reperfusão coronariana o mais rápido possível, por angioplastia primária ou fibrinólise.",
      "Realizar teste ergométrico para estratificação.",
      "Controlar apenas a dor, sem estratégia de reperfusão."
    ],
    "correct": 1,
    "explain": "No IAM com supra de ST, tempo é miocárdio: a reperfusão precoce (angioplastia primária ou fibrinólise, conforme disponibilidade e tempo) é o objetivo central.",
    "analysis": [
      "Com supra de ST e quadro compatível, não se aguarda troponina para indicar reperfusão.",
      "Correto: reperfusão precoce.",
      "Teste ergométrico é contraindicado na fase aguda.",
      "Analgesia é adjuvante, não substitui reperfusão."
    ],
    "key": "Supra de ST com quadro compatível: pense em reperfusão imediata.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "lra-01",
    "subtopic": "Lesão renal aguda",
    "title": "Critério KDIGO",
    "stem": "Segundo os critérios KDIGO, qual achado define lesão renal aguda?",
    "options": [
      "Qualquer creatinina acima de 1,0 mg/dL em exame isolado.",
      "Proteinúria acima de 3,5 g em 24 horas.",
      "Aumento da creatinina sérica ≥ 0,3 mg/dL em até 48 horas.",
      "Presença de cilindros hialinos na urina."
    ],
    "correct": 2,
    "explain": "KDIGO define LRA por aumento de creatinina ≥ 0,3 mg/dL em 48 horas, aumento ≥ 1,5 vez o basal em 7 dias ou débito urinário < 0,5 mL/kg/h por 6 horas.",
    "analysis": [
      "Um valor isolado não define variação aguda.",
      "Proteinúria nefrótica não é critério de LRA.",
      "Correto: é um dos critérios KDIGO.",
      "Cilindros hialinos não definem LRA."
    ],
    "key": "LRA é definida por variação no tempo, não por valor isolado.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "lra-02",
    "subtopic": "Lesão renal aguda",
    "title": "Classificar a causa",
    "stem": "Em um paciente com vômitos intensos e desidratação, qual é a categoria mais provável de lesão renal aguda?",
    "options": [
      "Pós-renal, por obstrução urinária.",
      "Pré-renal, por hipoperfusão renal.",
      "Glomerulonefrite rapidamente progressiva.",
      "Nefrite intersticial alérgica."
    ],
    "correct": 1,
    "explain": "Perdas de volume reduzem a perfusão renal, causando LRA pré-renal, potencialmente reversível com reposição volêmica.",
    "analysis": [
      "Não há dado de obstrução no caso.",
      "Correto: hipovolemia causa hipoperfusão renal.",
      "Não há sinais glomerulares no caso.",
      "Não há exposição a fármaco ou sinais alérgicos."
    ],
    "key": "Identifique primeiro se o problema está antes, no ou depois do rim.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "drc-01",
    "subtopic": "Doença renal crônica",
    "title": "Critério temporal",
    "stem": "Qual critério temporal é necessário para caracterizar doença renal crônica?",
    "options": [
      "Alterações de estrutura ou função renal presentes por mais de 7 dias.",
      "Alterações presentes por mais de 48 horas.",
      "Não há critério temporal.",
      "Alterações de estrutura ou função renal presentes por mais de 3 meses."
    ],
    "correct": 3,
    "explain": "DRC é definida por alterações de estrutura ou função renal presentes por mais de 3 meses, com implicações para a saúde.",
    "analysis": [
      "7 dias é horizonte de lesão aguda.",
      "48 horas é horizonte de LRA.",
      "Há critério temporal: mais de 3 meses.",
      "Correto: duração superior a 3 meses."
    ],
    "key": "Crônica: mais de 3 meses.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "drc-02",
    "subtopic": "Doença renal crônica",
    "title": "Hipercalemia no ECG",
    "stem": "Em um paciente com doença renal crônica avançada, qual alteração eletrocardiográfica sugere hipercalemia?",
    "options": [
      "Ondas T apiculadas, em tenda.",
      "Onda U proeminente.",
      "Onda delta.",
      "Ondas Q patológicas."
    ],
    "correct": 0,
    "explain": "A hipercalemia, frequente na DRC avançada, causa inicialmente ondas T apiculadas; níveis maiores podem alargar o QRS.",
    "analysis": [
      "Correto: T apiculada é o achado inicial clássico.",
      "Onda U proeminente sugere hipocalemia.",
      "Onda delta sugere pré-excitação.",
      "Ondas Q patológicas sugerem necrose miocárdica prévia."
    ],
    "key": "Potássio alto: T em tenda. Potássio baixo: onda U.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "tr-01",
    "subtopic": "Atendimento inicial",
    "title": "Sequência ABCDE",
    "stem": "Na sequência mnemônica ABCDE da avaliação primária do politraumatizado, a letra A corresponde a:",
    "options": [
      "Analgesia.",
      "Alergias.",
      "Via aérea com restrição de movimento da coluna cervical.",
      "Abdome."
    ],
    "correct": 2,
    "explain": "A avaliação primária prioriza ameaças imediatas à vida. A letra A corresponde à via aérea, com restrição de movimento da coluna cervical.",
    "analysis": [
      "Analgesia é importante, mas não é a letra A.",
      "Alergias fazem parte da história (AMPLE), não do A.",
      "Correto.",
      "O abdome é avaliado na circulação e na avaliação secundária."
    ],
    "key": "ABCDE segue a ordem das ameaças mais rápidas à vida.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "tr-02",
    "subtopic": "Atendimento inicial",
    "title": "Escala de Coma de Glasgow",
    "stem": "Na versão clássica da Escala de Coma de Glasgow, quais componentes são avaliados?",
    "options": [
      "Pupilas, pressão arterial e frequência cardíaca.",
      "Abertura ocular, resposta verbal e resposta motora.",
      "Força muscular, reflexos e sensibilidade.",
      "Orientação, memória e cálculo."
    ],
    "correct": 1,
    "explain": "A escala clássica soma abertura ocular (1–4), resposta verbal (1–5) e resposta motora (1–6), totalizando 3 a 15.",
    "analysis": [
      "Sinais vitais não compõem a escala clássica.",
      "Correto.",
      "São elementos do exame neurológico, não da escala.",
      "São elementos de avaliação cognitiva."
    ],
    "key": "Glasgow: olhos, fala e movimento.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "aa-01",
    "subtopic": "Apendicite aguda",
    "title": "Evolução clássica da dor",
    "stem": "Qual é a evolução clássica da dor na apendicite aguda?",
    "options": [
      "Início periumbilical ou epigástrico, com migração para a fossa ilíaca direita.",
      "Início na fossa ilíaca esquerda, com irradiação para o dorso.",
      "Dor em cólica no flanco, irradiada para a região inguinal.",
      "Dor no hipocôndrio direito após refeição gordurosa."
    ],
    "correct": 0,
    "explain": "A dor visceral inicial é periumbilical ou epigástrica; com a irritação peritoneal local, migra para a fossa ilíaca direita.",
    "analysis": [
      "Correto.",
      "Fossa ilíaca esquerda sugere outros diagnósticos, como diverticulite.",
      "Sugere cólica nefrética.",
      "Sugere doença biliar."
    ],
    "key": "Dor visceral difusa que se localiza indica irritação do peritônio parietal.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "aa-02",
    "subtopic": "Apendicite aguda",
    "title": "Sinal semiológico",
    "stem": "Qual sinal corresponde à dor à descompressão brusca no ponto de McBurney?",
    "options": [
      "Sinal de Murphy.",
      "Sinal de Giordano.",
      "Sinal de Cullen.",
      "Sinal de Blumberg."
    ],
    "correct": 3,
    "explain": "O sinal de Blumberg é a dor à descompressão brusca no ponto de McBurney, indicando irritação peritoneal.",
    "analysis": [
      "Murphy está associado à colecistite.",
      "Giordano está associado a acometimento renal.",
      "Cullen é equimose periumbilical.",
      "Correto."
    ],
    "key": "Associe cada sinal ao órgão que ele sugere.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "pe-01",
    "subtopic": "Pré-eclâmpsia",
    "title": "Definição temporal",
    "stem": "A pré-eclâmpsia é caracterizada por hipertensão de início após qual idade gestacional, associada a proteinúria ou disfunção de órgão-alvo?",
    "options": [
      "12 semanas.",
      "20 semanas.",
      "8 semanas.",
      "36 semanas."
    ],
    "correct": 1,
    "explain": "Pré-eclâmpsia: hipertensão identificada após 20 semanas de gestação, com proteinúria ou sinais de disfunção de órgão-alvo.",
    "analysis": [
      "Hipertensão antes de 20 semanas sugere hipertensão crônica.",
      "Correto.",
      "Não é o marco utilizado.",
      "Pode ocorrer bem antes de 36 semanas."
    ],
    "key": "Marco temporal da pré-eclâmpsia: 20 semanas.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "pe-02",
    "subtopic": "Pré-eclâmpsia",
    "title": "Prevenção de convulsões",
    "stem": "Qual medicamento é utilizado na prevenção e no tratamento das convulsões eclâmpticas?",
    "options": [
      "Fenitoína como primeira escolha.",
      "Diazepam como primeira escolha.",
      "Sulfato de magnésio.",
      "Furosemida."
    ],
    "correct": 2,
    "explain": "O sulfato de magnésio é o fármaco de escolha para prevenção e tratamento das convulsões na pré-eclâmpsia grave e na eclâmpsia.",
    "analysis": [
      "Não é a primeira escolha na eclâmpsia.",
      "Não é a primeira escolha na eclâmpsia.",
      "Correto.",
      "Diurético não previne convulsões."
    ],
    "key": "Eclâmpsia: sulfato de magnésio.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "pn-01",
    "subtopic": "Pré-natal",
    "title": "Prevenção de defeitos do tubo neural",
    "stem": "Qual suplementação, idealmente iniciada antes da concepção, reduz o risco de defeitos do tubo neural?",
    "options": [
      "Ácido fólico.",
      "Vitamina C.",
      "Vitamina A em altas doses.",
      "Vitamina K."
    ],
    "correct": 0,
    "explain": "O ácido fólico periconcepcional reduz o risco de defeitos do tubo neural.",
    "analysis": [
      "Correto.",
      "Não tem esse efeito.",
      "Doses altas de vitamina A podem ser teratogênicas.",
      "Vitamina K é usada no recém-nascido para prevenir doença hemorrágica."
    ],
    "key": "Tubo neural fecha cedo: suplementar antes e no início da gestação.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "pn-02",
    "subtopic": "Pré-natal",
    "title": "Triagem de sífilis",
    "stem": "No pré-natal, qual é a finalidade principal da triagem sorológica para sífilis?",
    "options": [
      "Definir a via de parto em todas as gestantes.",
      "Avaliar a vitalidade fetal.",
      "Calcular a idade gestacional.",
      "Identificar e tratar precocemente para prevenir sífilis congênita."
    ],
    "correct": 3,
    "explain": "A triagem permite diagnosticar e tratar a gestante (e parcerias) a tempo de prevenir a transmissão vertical.",
    "analysis": [
      "Não é a finalidade da triagem.",
      "Vitalidade é avaliada por outros métodos.",
      "Idade gestacional usa DUM e ultrassonografia.",
      "Correto."
    ],
    "key": "Triagem no pré-natal existe para permitir tratamento a tempo.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "neo-01",
    "subtopic": "Sala de parto",
    "title": "Momentos do Apgar",
    "stem": "Em quais momentos o boletim de Apgar é classicamente avaliado após o nascimento?",
    "options": [
      "Apenas na primeira hora.",
      "No 1º e no 5º minuto de vida.",
      "Somente no 10º minuto.",
      "Exclusivamente antes do clampeamento do cordão."
    ],
    "correct": 1,
    "explain": "O Apgar é registrado no 1º e no 5º minuto, podendo ser repetido a cada 5 minutos se baixo. Não é utilizado para decidir o início da reanimação.",
    "analysis": [
      "Não é a forma clássica.",
      "Correto.",
      "O 10º minuto é usado apenas em situações específicas.",
      "Não é o momento de avaliação."
    ],
    "key": "Apgar descreve a adaptação; não decide reanimação.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "neo-02",
    "subtopic": "Sala de parto",
    "title": "Componentes do Apgar",
    "stem": "Qual parâmetro faz parte do boletim de Apgar?",
    "options": [
      "Peso ao nascer.",
      "Glicemia capilar.",
      "Perímetro cefálico.",
      "Frequência cardíaca."
    ],
    "correct": 3,
    "explain": "O Apgar avalia frequência cardíaca, esforço respiratório, tônus muscular, irritabilidade reflexa e cor.",
    "analysis": [
      "Não faz parte.",
      "Não faz parte.",
      "Não faz parte.",
      "Correto."
    ],
    "key": "Cinco itens, de 0 a 2 pontos cada.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "pu-01",
    "subtopic": "Aleitamento e crescimento",
    "title": "Aleitamento exclusivo",
    "stem": "Qual é a recomendação da OMS e do Ministério da Saúde para o aleitamento materno exclusivo?",
    "options": [
      "Até os 2 meses de vida.",
      "Até os 12 meses, sem introdução de outros alimentos.",
      "Até os 6 meses de vida.",
      "Somente durante a internação na maternidade."
    ],
    "correct": 2,
    "explain": "Recomenda-se aleitamento materno exclusivo até os 6 meses e complementado até 2 anos ou mais.",
    "analysis": [
      "Período inferior ao recomendado.",
      "A alimentação complementar começa aos 6 meses.",
      "Correto.",
      "Período inferior ao recomendado."
    ],
    "key": "Exclusivo até 6 meses; complementado até 2 anos ou mais.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "pu-02",
    "subtopic": "Aleitamento e crescimento",
    "title": "Acompanhamento do crescimento",
    "stem": "Na puericultura, qual instrumento é utilizado para acompanhar crescimento e desenvolvimento da criança no Brasil?",
    "options": [
      "Caderneta da Criança, com curvas de crescimento.",
      "Cartão Nacional de Saúde apenas.",
      "Boletim de Apgar.",
      "Partograma."
    ],
    "correct": 0,
    "explain": "A Caderneta da Criança reúne curvas de crescimento, marcos do desenvolvimento e vacinação.",
    "analysis": [
      "Correto.",
      "O cartão identifica o usuário, não registra crescimento.",
      "O Apgar avalia apenas o nascimento.",
      "O partograma acompanha o trabalho de parto."
    ],
    "key": "Acompanhamento longitudinal: Caderneta da Criança.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "ep-01",
    "subtopic": "Medidas e testes diagnósticos",
    "title": "Sensibilidade",
    "stem": "Sensibilidade de um teste diagnóstico é a proporção de:",
    "options": [
      "Não doentes corretamente identificados como negativos.",
      "Doentes corretamente identificados como positivos.",
      "Positivos que realmente têm a doença.",
      "Negativos que realmente não têm a doença."
    ],
    "correct": 1,
    "explain": "Sensibilidade = verdadeiros positivos / todos os doentes.",
    "analysis": [
      "Essa é a especificidade.",
      "Correto.",
      "Esse é o valor preditivo positivo.",
      "Esse é o valor preditivo negativo."
    ],
    "key": "Sensibilidade parte dos doentes; valores preditivos partem do resultado do teste.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "ep-02",
    "subtopic": "Medidas e testes diagnósticos",
    "title": "Prevalência e incidência",
    "stem": "Qual medida expressa a proporção de casos existentes de uma doença em uma população em determinado momento?",
    "options": [
      "Incidência.",
      "Letalidade.",
      "Prevalência.",
      "Sensibilidade."
    ],
    "correct": 2,
    "explain": "Prevalência considera casos existentes (novos e antigos) em um momento; incidência considera casos novos em um período.",
    "analysis": [
      "Incidência mede casos novos.",
      "Letalidade mede óbitos entre doentes.",
      "Correto.",
      "Sensibilidade é propriedade de teste diagnóstico."
    ],
    "key": "Prevalência: estoque. Incidência: fluxo.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "sus-01",
    "subtopic": "Princípios e legislação",
    "title": "Princípios doutrinários",
    "stem": "Quais são os princípios doutrinários do SUS?",
    "options": [
      "Universalidade, integralidade e equidade.",
      "Hierarquização, regionalização e descentralização.",
      "Seletividade, centralização e focalização.",
      "Exclusividade, gratuidade parcial e centralização."
    ],
    "correct": 0,
    "explain": "Universalidade, integralidade e equidade são os princípios doutrinários; regionalização, hierarquização, descentralização e participação popular são organizativos.",
    "analysis": [
      "Correto.",
      "São princípios organizativos.",
      "Contrariam os princípios do SUS.",
      "Não são princípios do SUS."
    ],
    "key": "Doutrinários: o que o SUS garante. Organizativos: como se estrutura.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  },
  {
    "id": "sus-02",
    "subtopic": "Princípios e legislação",
    "title": "Participação da comunidade",
    "stem": "Qual lei dispõe sobre a participação da comunidade na gestão do SUS e sobre as transferências intergovernamentais de recursos?",
    "options": [
      "Lei nº 8.080/1990.",
      "Lei nº 8.142/1990.",
      "Lei nº 9.656/1998.",
      "Lei nº 13.709/2018."
    ],
    "correct": 1,
    "explain": "A Lei 8.142/1990 trata da participação da comunidade (conferências e conselhos de saúde) e das transferências de recursos.",
    "analysis": [
      "A 8.080 é a Lei Orgânica da Saúde, sobre organização e funcionamento.",
      "Correto.",
      "Trata de planos de saúde.",
      "É a Lei Geral de Proteção de Dados."
    ],
    "key": "8.080: organização. 8.142: participação e financiamento.",
    "provenance": {
      "sourceType": "AI_ASSISTED_AUTHORED",
      "sourceName": "MedAI — banco inicial (questões autorais com redação assistida por IA)",
      "sourceUrl": null,
      "sourceDate": null,
      "lastVerifiedAt": null,
      "validationStatus": "PROVISIONAL",
      "examAttribution": null,
      "references": [],
      "notes": "Questão autoral e simplificada, não reproduzida de prova. Sem revisão médica humana registrada."
    }
  }
];
