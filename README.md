# MedAI — protótipo navegável

Aplicativo demonstrativo em português para preparação para residência médica. HTML, CSS e JavaScript sem dependências, backend ou chamadas de IA. Os arquivos finais estão em `dist/`.

## Executar

Com Node.js 20 ou superior instalado, abra um terminal nesta pasta e execute:

```sh
npm start
```

Acesse http://127.0.0.1:4173. Também é possível abrir `dist/index.html` diretamente; a persistência em URLs de arquivo depende do navegador.

## Fluxos

Entrada demonstrativa → onboarding → visão geral → sessão → questão → correção → tutor contextual → resultado. Mapa hierárquico com cinco áreas, detalhes de tema, fila de revisões, edição de meta, mini-simulado e seleção de plano fictício.

O banco contém três questões autorais de fundamentos de hipertensão, com referência à ficha educacional da OMS: https://www.who.int/news-room/fact-sheets/detail/hypertension. Os demais temas demonstram a navegação, sem questões próprias. Conteúdo não destinado a decisões clínicas.

Respostas, meta, plano e revisões são guardados em `localStorage`, chave `medai-v1`. Não há autenticação real. Use nomes fictícios. Sair preserva o progresso local. Para reiniciar, limpe os dados deste site no navegador.

Métricas e histórico iniciais são fictícios. Novas respostas atualizam total de questões, taxa agregada e domínio de hipertensão. Erros adicionam o tema à revisão; uma revisão com três acertos o remove. Sessões podem ser pausadas e retomadas. Tutor utiliza respostas pré-definidas, limitadas ao contexto da questão. Os planos não cobram nem limitam recursos reais.

## Verificação

```sh
npm run check
```

O servidor serve somente os três arquivos públicos permitidos. O projeto não precisa de compilação. Para hospedagem estática, publique o conteúdo de `dist/`; rotas utilizam fragmentos de URL.
